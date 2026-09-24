// ⟳ 2026-09-24 — SORTI DE `HouseholdPage.tsx` (découpage, lot 4c), À L'IDENTIQUE.
// « Qui mange ici »: la liste des bouches.
// Le fichier d'origine l'atteint par ses imports; il ré-exporte ce qu'il exportait.

import React from "react";
import { type AllergyView, type HouseholdMemberView, type HouseholdView, type MemberBodyView, type MemberGender, type MemberGoal, type RestrictionView, restrictionNotice, type LiveInvitation } from "../../api/household";
import type { EatingOccasionSlot } from "../../api/mealGeneration";
import type { HabitSlotWrite, MemberHabitsView } from "../../api/householdHabits";
import type { MemberTargetView } from "../../api/mouthProfile";
import type { MouthFormDraft } from "../../lib/mouthForm";
import type { MouthActivityAndStructure } from "../../components/MouthFormDialog";
import { t } from "../../i18n/t";
import { Card, SectionLabel } from "../../components/ui/Card";
import { type OwnFiche, MeFiche } from "./MeFiche.tsx";
import { MemberBadges } from "./MemberBadges.tsx";
import { MemberRow } from "./MemberRow.tsx";

/**
 * QUI MANGE ICI — la liste, et pour le compte maître, l'endroit où l'on corrige.
 *
 * La carte de restrictions séparée a disparu: elle demandait « pour qui ? »
 * dans un sélecteur alors que la personne est déjà la ligne qu'on regarde. Ce
 * qu'elle portait est ici, PAR BOUCHE, avec la question qui manquait — de
 * quelle nature est cette contrainte.
 */
export function MembersCard(
  { household, ownFiche, footer, restrictions, allergies, busy, mutedMembers, rhythm, bodies, targets, memberBirthDates, habits, invitations, onInvited, onSaveHabits, onSavePreferences, onSaveTarget, onSaveBody, onMute, onSave, onRemove, onDetach, onAddAllergy, onRemoveAllergy, onAddRestriction, onRemoveRestriction, todayLocalIso }: {
    household: HouseholdView;
    /**
     * LA FICHE DU TITULAIRE, ou `null` — 2026-09-09.
     *
     * ⛔ QUAND ELLE N'EST PAS `null`, LA LIGNE DU TITULAIRE NE SE REND PAS.
     * C'est toute la raison de cette prop: les deux se rendaient, et la même
     * personne portait deux fiches, deux boutons « Modifier » et deux fenêtres
     * qui écrivent les mêmes colonnes. Une personne, une fiche.
     *
     * `null` = la page n'a pas de quoi la monter (pas de `me`, ou la ligne
     * `student_goals` pas encore lue), ou le lecteur n'est pas le maître: sa
     * ligne reste alors dans la liste, éditable comme avant.
     */
    ownFiche: OwnFiche | null;
    /**
     * CE QUI SE FAIT SOUS LA LISTE — « ajouter quelqu'un », ou `null`.
     *
     * ⚠️ UN SLOT ET PAS UNE CARTE À PART: la carte d'ajout portait son propre
     * titre de section au-dessus de « qui mange ici », ce qui faisait deux
     * en-têtes pour un seul sujet — les gens du foyer. Le geste vit maintenant
     * au pied de la liste qu'il allonge.
     */
    footer: React.ReactNode;
    restrictions: RestrictionView[];
    /* ⛔ `dislikes` A ÉTÉ RETIRÉ DE CETTE CARTE — ⟳ 2026-09-21, avec le
       résumé qui était son seul lecteur. Le pavé qui vivait ici tenait une
       distinction qui reste VRAIE et qui est écrite à sa source
       (`MouthPreferencesFields`): une RÈGLE DE MAISON est une interdiction
       du maître, un DÉGOÛT est une préférence de la bouche. Les confondre
       avait fait réenregistrer chaque règle en préférence au premier
       « Enregistrer » — défaut fermé par le lot C, et rien ici ne le
       rouvre: ce fil ne transporte plus rien. */
    allergies: AllergyView[];
    busy: boolean;
    /** `YYYY-MM-DD` local, descendu à chaque fiche — voir `MeFiche`. */
    todayLocalIso: string;
    /** A5 §5.5 — les invitations vivantes, `null` = pas lu. */
    invitations: Map<string, LiveInvitation> | null;
    /** La page relit ses faits après une invitation créée. REQUIS. */
    onInvited: () => void | Promise<void>;
    /**
     * CE QUE CHAQUE BOUCHE MANGE D'HABITUDE. `null` = PAS ENCORE LU — et la
     * carte n'affiche alors aucun champ. Voir l'état de la page.
     */
    habits: Map<string, MemberHabitsView> | null;
    onSaveHabits: (
      memberId: string,
      slots: HabitSlotWrite[],
      note: string | null,
    ) => Promise<boolean>;
    /**
     * TOUT CE QUE LA FICHE DE GOÛTS D'UNE BOUCHE A COLLECTÉ — 2026-09-19.
     * Il REMPLACE `onSaveDiet`: le régime est une section de la fiche, plus un
     * bloc de boutons à part. Voir `MemberRow`.
     */
    onSavePreferences: (
      member: HouseholdMemberView,
      draft: MouthFormDraft,
    ) => Promise<boolean>;
    /**
     * Les corps saisis, par `member_id`. VIDE pour un non-maître, et pas parce
     * que l'écran le décide: `keel_household_member_bodies` lui rend zéro
     * ligne. La table n'a aucun grant à `authenticated`.
     *
     * ⟳ A5 — `null` = LA LECTURE N'A PAS EU LIEU, et ce n'est PAS « vide ».
     * `BodyFields` fige ses champs au montage: le cadre « Informations
     * personnelles » ne se rend pas tant que c'est `null`.
     */
    bodies: Map<string, MemberBodyView> | null;
    /**
     * LOT A2 — LA CIBLE ET LE RYTHME DE CHAQUE BOUCHE. `null` = PAS LU.
     *
     * ⛔ LA MAP ENTIÈRE DESCEND, `null` COMPRIS, et c'est la ligne qui y
     * cherche la sienne: aplatir ici en `?? new Map()` ferait de « pas lu » un
     * « lu, rien » — c'est-à-dire un curseur vide qu'un Enregistrer écrirait.
     */
    targets: Map<string, MemberTargetView> | null;
    /** LOT A2 — les dates, pour l'âge qui borne le curseur. `null` = pas lu. */
    memberBirthDates: Map<string, string> | null;
    /**
     * LOT A2 — ÉCRIT LA PAIRE, OU L'EFFACE. REQUIS, jamais optionnel: un
     * curseur dont l'écrivain est facultatif est un curseur qui peut ne rien
     * faire, et « un geste qui ne fait rien est indiscernable d'un geste qui a
     * marché ».
     */
    onSaveTarget: (
      memberId: string,
      targetWeightKg: number | null,
      paceKgPerWeek: number | null,
    ) => Promise<boolean>;
    onSaveBody: (
      memberId: string,
      heightCm: number,
      weightKg: number,
      gender: MemberGender,
      /**
       * ② les deux axes · ① les trois cases (2026-08-20), REQUIS.
       *
       * ⛔ Ce sont les questions que la fiche pose maintenant, et cette
       * rangée est le SEUL chemin d'écriture d'une bouche déjà inscrite. Un
       * paramètre facultatif ici aurait laissé le formulaire les afficher et le
       * bouton les jeter — « un champ qu'on remplit et qui ne va nulle part est
       * pire qu'un champ absent, il promet ».
       */
      extras: MouthActivityAndStructure,
    ) => Promise<boolean>;
    /** D17 — les bouches dont on ne veut plus voir les propositions. */
    mutedMembers: Set<string> | null;
    /** Le repli des moments d'une bouche qui n'a rien déclaré. */
    rhythm: EatingOccasionSlot[];
    onMute: (memberId: string, muted: boolean) => void;
    onSave: (
      member: HouseholdMemberView,
      patch: { firstName: string; birthDate: string | null; goal: MemberGoal | null },
    ) => Promise<boolean>;
    onRemove: (memberId: string) => void;
    onDetach: (memberId: string) => void;
    onAddAllergy: (memberId: string, label: string) => void;
    onRemoveAllergy: (id: string) => void;
    onAddRestriction: (memberId: string, label: string) => void;
    onRemoveRestriction: (id: string) => void;
  },
) {
  const me = household.me;
  const isOwner = me?.role === "owner";

  // CÔTÉ MEMBRE NON MAÎTRE: la liste, et SES contraintes, attribuées. §8.5
  // règle 3 — elle voit qu'elle est restreinte ET par qui.
  if (!isOwner) {
    const mine = restrictions.filter((r) => r.memberId === me?.memberId);
    return (
      <Card>
        {/* ⟳ LE TITRE EST REMONTÉ DANS LA SECTION DE LA PAGE (2026-09-09):
            « les membres du foyer » coiffe la liste ET le geste d'ajout, comme
            « paramètres du foyer » coiffe ses deux cartes. */}
        {/* ══════════════════════════════════════════════════════════════
            A5 POINT 6 — SA LIGNE S'ÉDITE, LES AUTRES SE LISENT
            ══════════════════════════════════════════════════════════════

            ⛔ CE QUI ÉTAIT FAUX: la page entière était en lecture seule pour un
            profil réclamé — huit pastilles, et rien d'autre. Or il PEUT écrire
            sur sa propre ligne, et la base le dit: `not_your_line` (et non
            `not_owner`) garde le prénom, la date de naissance, les habitudes,
            les absences et le déjeuner de semaine. Un écran qui ne propose pas
            ce que la base accepte est un écran qui ment par omission, et c'est
            LUI qui décide de ce que la personne peut dire d'elle-même.

            ⚠️ LES AUTRES LIGNES RESTENT DES PASTILLES: prénom et état d'âge.
            Pas un cadre vide, JAMAIS — `keel_household_member_bodies` rend zéro
            ligne à un membre, donc un cadre « personne n'a de corps » affirmerait
            une absence qu'il n'a pas lue. On ne rend pas ce qu'on ne sait pas.

            ⚠️ ET LA FICHE OUVERTE EST BORNÉE PAR `viewerIsOwner`, pas par une
            liste de champs recopiée ici: le corps, le régime, les allergies,
            les règles, l'invitation et les deux retraits ne se rendent pas, un
            par un, à l'endroit où ils sont écrits. Une seconde liste de droits
            divergerait de la première au premier champ ajouté. */}
        <ul className="mb-3 flex flex-col gap-3">
          {household.members.map((m) =>
            m.memberId === me?.memberId
              ? (
                <MemberRow
                  key={m.memberId}
                  member={m}
                  todayLocalIso={todayLocalIso}
                  isMe
                  viewerIsOwner={false}
                  allergies={allergies.filter((a) => a.memberId === m.memberId)}
                  restrictions={restrictions.filter((r) => r.memberId === m.memberId)}
                  busy={busy}
                  // Le réglage de fusion est au maître: `null` = on ne montre
                  // pas un interrupteur dont on ignore la position, et celui-ci
                  // n'est même pas le sien.
                  muted={null}
                  rhythm={rhythm}
                  // ⛔ ZÉRO LIGNE POUR LUI, ET LE CADRE NE SE REND PAS: `body`
                  // reste `null`, mais c'est `viewerIsOwner={false}` qui retire
                  // le bloc — pas cette valeur, qui voudrait dire « lu, rien ».
                  body={null}
                  bodiesLoaded={bodies !== null}
                  // ⛔ LOT A2 · TROIS FAITS QUE LA BASE NE LUI REND PAS, ET LE
                  // CADRE NE SE REND PAS NON PLUS. `keel_household_set_member_
                  // target` répond `not_owner` à un profil réclamé, et
                  // `loadMemberTargets` n'est appelé que dans la branche du
                  // maître: `targets` vaut donc `null` ici, ce qui est la
                  // vérité — « pas lu », pas « rien ». C'est `viewerIsOwner`
                  // qui retire le bloc, comme pour le corps.
                  target={null}
                  targetsLoaded={false}
                  knownBirthDate={null}
                  onSaveTarget={(tw, pw) => onSaveTarget(m.memberId, tw, pw)}
                  // ⚠️ CE COMMENTAIRE A ÉTÉ FAUX, et c'est le défaut n°1 de la
                  // vérification: il affirmait que `MemberAccess` ne rendait
                  // « qu'un état » à un membre, alors que le composant ne
                  // recevait AUCUN fait sur son lecteur et rendait le bouton de
                  // détachement à tout le monde. Il dit maintenant ce que le
                  // code FAIT: la garde est `viewerIsOwner`, passée par
                  // `MemberRow`, et un cas la capture sur le HTML rendu.
                  invitations={invitations}
                  onInvited={onInvited}
                  // ⚠️ MÊME PARTAGE QUE CHEZ LE MAÎTRE: `habitsLoaded` dit si
                  // la LECTURE a eu lieu, `habits` ce qu'elle a trouvé. Le
                  // cadre des préférences ne se rend pas tant que le premier
                  // est faux.
                  habitsLoaded={habits !== null}
                  habits={habits?.get(m.memberId) ?? null}
                  onSaveHabits={(sl, n) => onSaveHabits(m.memberId, sl, n)}
                  onSavePreferences={(d) => onSavePreferences(m, d)}
                  onSaveBody={(h, w, g, extras) => onSaveBody(m.memberId, h, w, g, extras)}
                  onMute={(next) => onMute(m.memberId, next)}
                  onSave={(patch) => onSave(m, patch)}
                  // Câblés mais INATTEIGNABLES depuis cette vue: les deux
                  // boutons ne se rendent pas (`viewerIsOwner={false}`), et la
                  // base les refuserait (`not_owner`). On ne passe pas `null`:
                  // une porte facultative est une porte désarmée, et la même
                  // ligne rendue au maître doit garder ses gestes.
                  onRemove={() => onRemove(m.memberId)}
                  onDetach={() => onDetach(m.memberId)}
                  onAddAllergy={(label) => onAddAllergy(m.memberId, label)}
                  onRemoveAllergy={onRemoveAllergy}
                  onAddRestriction={(label) => onAddRestriction(m.memberId, label)}
                  onRemoveRestriction={onRemoveRestriction}
                />
              )
              : <MemberBadges key={m.memberId} member={m} />
          )}
        </ul>
        {mine.length > 0 ? (
          <>
          <SectionLabel>{t("household.restriction.title")}</SectionLabel>
          <ul className="flex flex-col gap-1 text-sm">
            {mine.map((r) => {
              const notice = restrictionNotice(household, r);
              return (
                <li key={r.id}>
                  <span className="font-medium">{r.label}</span>{" — "}
                  <span className="text-ink-soft">
                    {notice.kind === "set_by_me"
                      ? t("household.restriction.notice_me")
                      : t("household.restriction.notice_owner", { owner: notice.ownerName })}
                  </span>
                </li>
              );
            })}
          </ul>
          </>
        ) : null}
        {/* ⚠️ RENDU DANS LES DEUX BRANCHES, même s'il vaut `null` pour un
            secondaire (`keel_household_add_member` lui répond `not_owner`):
            une prop rendue dans une seule branche est une prop qu'on croit
            passer et qui disparaît en silence. */}
        {footer}
      </Card>
    );
  }

  return (
    <Card>
      <ul className="flex flex-col gap-3">
        {/* ── MA FICHE EN PREMIER, ET UNE SEULE FOIS ────────────────────
            « La première bouche en premier »: tant que la ligne d'objectif du
            compte maître n'existe pas, la composition échouerait — autant le
            lui dire AVANT qu'il saisisse trois personnes. */}
        {ownFiche !== null && me !== null ? (
          <MeFiche
            key={me.memberId}
            me={me}
            fiche={ownFiche}
            allergies={allergies.filter((a) => a.memberId === me.memberId)}
            busy={busy}
            todayLocalIso={todayLocalIso}
            onRemoveAllergy={onRemoveAllergy}
          />
        ) : null}
        {household.members
          // ⛔ SA LIGNE NE SE REND PAS DEUX FOIS. Voir `ownFiche`.
          .filter((m) => !(ownFiche !== null && m.memberId === me?.memberId))
          .map((m) => (
          <MemberRow
            key={m.memberId}
            member={m}
            todayLocalIso={todayLocalIso}
            isMe={m.memberId === me?.memberId}
            viewerIsOwner
            allergies={allergies.filter((a) => a.memberId === m.memberId)}
            restrictions={restrictions.filter((r) => r.memberId === m.memberId)}
            busy={busy}
            // D17 — `null` tant que le réglage n'est pas lu, et `null` aussi
            // quand la lecture a échoué: on ne montre pas un interrupteur dont
            // on ignore la position.
            muted={mutedMembers === null ? null : mutedMembers.has(m.memberId)}
            rhythm={rhythm}
            // `null` = rien de saisi POUR CETTE BOUCHE. La carte des corps est
            // vide pour un non-maître (la RPC lui rend zéro ligne), donc ce
            // bloc ne s'affiche que là où il est légitime.
            body={bodies?.get(m.memberId) ?? null}
            // LA LECTURE DES CORPS, SÉPARÉE DE SON CONTENU — même partage que
            // `habitsLoaded` juste en dessous, et pour la même raison.
            bodiesLoaded={bodies !== null}
            // ── LOT A2 · LA CIBLE, SA LECTURE, ET LA DATE QUI LA BORNE ──────
            // MÊME PARTAGE QUE LES CORPS, ET IL EST OBLIGATOIRE ICI: `target`
            // nul avec `targetsLoaded` vrai veut dire « lu, cette bouche ne
            // vise rien » — une réponse, sur laquelle le curseur part à son
            // maximum. `targetsLoaded` faux veut dire « on ne sait pas », et
            // rien ne doit s'afficher ni s'écrire dessus.
            target={targets?.get(m.memberId) ?? null}
            targetsLoaded={targets !== null}
            // `undefined` DEVIENT `null` — « pas de date lisible ». Le curseur
            // le DIT (`pace_needs_body`) plutôt que de calculer un plafond sur
            // un âge deviné.
            knownBirthDate={memberBirthDates?.get(m.memberId) ?? null}
            onSaveTarget={(tw, pw) => onSaveTarget(m.memberId, tw, pw)}
            invitations={invitations}
            onInvited={onInvited}
            // DEUX `null` QUI NE VEULENT PAS DIRE LA MÊME CHOSE, et c'est le
            // piège du lot. `habitsLoaded` faux = LA LECTURE N'A PAS EU LIEU.
            // `habits` nul avec `habitsLoaded` vrai = LA LECTURE A EU LIEU et
            // personne n'a rien dit de cette bouche. Le second est une
            // réponse; le premier n'en est pas une, et rien ne doit s'afficher
            // dessus.
            habitsLoaded={habits !== null}
            habits={habits?.get(m.memberId) ?? null}
            // A6 — la Map ENTIÈRE descend, `null` compris: c'est la carte qui
            // distingue « pas lu » de « lu, rien pour cette bouche ».
            onSaveHabits={(s, n) => onSaveHabits(m.memberId, s, n)}
            onSavePreferences={(dr) => onSavePreferences(m, dr)}
            onSaveBody={(h, w, g, extras) => onSaveBody(m.memberId, h, w, g, extras)}
            onMute={(next) => onMute(m.memberId, next)}
            onSave={(patch) => onSave(m, patch)}
            onRemove={() => onRemove(m.memberId)}
            onDetach={() => onDetach(m.memberId)}
            onAddAllergy={(label) => onAddAllergy(m.memberId, label)}
            onRemoveAllergy={onRemoveAllergy}
            onAddRestriction={(label) => onAddRestriction(m.memberId, label)}
            onRemoveRestriction={onRemoveRestriction}
          />
        ))}
      </ul>
      {footer}
    </Card>
  );
}
