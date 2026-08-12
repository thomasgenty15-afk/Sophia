import React from "react";

import { useAuth } from "../../context/AuthContext";
import {
  addAllergy,
  addHouseholdMember,
  addRestriction,
  type AllergyView,
  birthDateDoor,
  claimableMembers,
  createHousehold,
  createOwnerGoalRow,
  detachHouseholdMember,
  ENVY_MAX_CHARS,
  generateHouseholdMeal,
  hasOwnerGoalRow,
  type HouseholdCoverage,
  type HouseholdMealView,
  type HouseholdMemberView,
  type HouseholdView,
  inviteToHousehold,
  loadAllergies,
  loadEnvyLine,
  loadHousehold,
  loadHouseholdMeal,
  loadHouseholdRhythm,
  loadMyHouseholdCoverage,
  loadRestrictions,
  MEMBER_GOALS,
  type MemberGoal,
  openHouseholdCheckout,
  removeAllergy,
  removeHouseholdMember,
  removeRestriction,
  type RestrictionView,
  restrictionNotice,
  setMemberAway,
  setMemberBirthDate,
  setMemberGoal,
  setMemberName,
  setOwnBirthDate,
  submitEnvy,
} from "../api/household";
import { addDays, weekStartFor } from "../api/dates";
import { type AwayDay, type EatingOccasionSlot } from "../api/mealGeneration";
import {
  MAX_WINDOW_DAYS,
  resolveRequestedWindow,
  windowDayOrder,
} from "../api/mealWindow";
import MealPickerGrid from "../components/MealPickerGrid";
import { t } from "../i18n/t";
import KeelAppShell from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";

// KEEL — /app/household.
//
// LE FOYER: qui mange ici, ce dont chacun a envie, et ce que la maison ne sert
// pas. Autorité produit: docs/keel/PIVOT-FOYER.md §8.
//
// ── LA DÉCISION QUI GOUVERNE TOUT L'ÉCRAN (§8.5 règle 4) ───────────────────
// Il y a DEUX autorités dans ce produit, et cet écran est le seul endroit où
// elles se croisent visuellement. Elles ne doivent jamais se ressembler:
//
//   SOPHIA        explique, ne bloque jamais.       — ailleurs dans le produit
//   COMPTE MAÎTRE restreint, sous conditions.       — ICI, et nommément
//
// D'où le libellé de chaque restriction: « Not served here — {owner} decided
// that ». Jamais « ce n'est pas recommandé », jamais une raison de santé. Faire
// passer une décision parentale pour une vérité nutritionnelle est le mensonge
// que §8.5 interdit, et le jour où l'enfant s'en aperçoit, plus rien de ce que
// dit Sophia n'a de poids.
//
// ── LA GARDE DE MONTAGE ────────────────────────────────────────────────────
// Rien n'est rendu avant la première lecture. Un formulaire monté sur du vide
// affiche des champs que personne n'a lus, puis les écrase au premier Save
// (leçon `mount-snapshot-forms-need-a-loading-gate`).
//
// ── L'AJOUT EN 90 SECONDES (lot 4, 2026-08-10) ─────────────────────────────
//
// LE COMPTE MAÎTRE EST LA PREMIÈRE BOUCHE, pas un administrateur. Ce n'est pas
// une posture: `generate-household-meal-v1` refuse de démarrer tant qu'il n'a
// pas de ligne `student_goals` (`goal_required`, 409) — et on se prenait ce mur
// EXACTEMENT après l'effort d'avoir saisi trois personnes. Sa carte est donc la
// première de l'écran, et elle écrit cette ligne.
//
// TROIS CHAMPS, ET DEUX SONT FACULTATIFS:
//   · le PRÉNOM est obligatoire. `household_turn_context.ts` filtre en silence
//     toute portion au prénom vide: une bouche sans prénom voit sa part
//     DISPARAÎTRE, sans erreur.
//   · l'ÂGE est facultatif mais gouvernant. Sans lui, `keel_household_member_age`
//     rend `unknown` et `goalApplies` refuse toute direction. La garde échoue du
//     bon côté, et l'incitation à compléter est écrite sous le champ.
//   · l'OBJECTIF est facultatif: pas de direction = part standard.
//
// ── LES DEUX NATURES D'UNE CONTRAINTE, ET POURQUOI L'ÉCRAN LES DEMANDE ─────
//
// Une ALLERGIE est médicale: elle rejoint l'union de sécurité du générateur,
// gouverne toute la casserole, et rien ne se compose si on ne peut pas la lire.
// Une RÈGLE DE MAISON est parentale: elle garde le verrou qui EFFACE le
// « pourquoi » du plat, pour que Sophia ne porte pas une décision domestique
// comme un conseil de santé. Deux tables, deux RPC — et la question est posée à
// l'utilisateur parce que la réponse change ce que le produit fait.

type Loading = "loading" | "ready" | "error";

/**
 * Le motif de refus d'une RPC de foyer, traduit — liste FERMÉE.
 *
 * Même discipline que `inviteErrorText`: un motif inconnu rend `null` plutôt
 * qu'une clé brute, et l'écran retombe alors sur le motif tel quel. Le silence
 * force à ajouter l'étiquette au lieu de la tolérer.
 */
function householdErrorText(reason: string): string | null {
  switch (reason) {
    case "bad_first_name":
      return t("household.error.bad_first_name");
    case "bad_birth_date":
      return t("household.error.bad_birth_date");
    case "bad_goal":
      return t("household.error.bad_goal");
    case "bad_label":
      return t("household.error.bad_label");
    case "bad_away":
      return t("household.error.bad_away");
    case "household_full":
      return t("household.error.household_full");
    case "not_owner":
      return t("household.error.not_owner");
    case "not_a_member":
      return t("household.error.not_a_member");
    case "not_your_line":
      return t("household.error.not_your_line");
    case "no_household":
      return t("household.error.no_household");
    case "cannot_remove_owner":
      return t("household.error.cannot_remove_owner");
    case "cannot_detach_owner":
      return t("household.error.cannot_detach_owner");
    case "not_claimed":
      return t("household.error.not_claimed");
    case "not_found":
      return t("household.error.not_found");
    default:
      return null;
  }
}

function goalLabel(goal: MemberGoal): string {
  switch (goal) {
    case "fat_loss":
      return t("household.goal.fat_loss");
    case "muscle_gain":
      return t("household.goal.muscle_gain");
    case "recomposition":
      return t("household.goal.recomposition");
    case "performance":
      return t("household.goal.performance");
    case "health":
      return t("household.goal.health");
    case "maintenance":
      return t("household.goal.maintenance");
  }
}

/** Le plafond vit EN BASE (`household_full`). L'écran ne fait que le dire. */
const HOUSEHOLD_MAX_MEMBERS = 8;

export default function HouseholdPage(): React.ReactElement {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [phase, setPhase] = React.useState<Loading>("loading");
  const [household, setHousehold] = React.useState<HouseholdView | null>(null);
  const [restrictions, setRestrictions] = React.useState<RestrictionView[]>([]);
  const [allergies, setAllergies] = React.useState<AllergyView[]>([]);
  // `null` = le maître n'a rien écrit cette semaine. C'est un état NORMAL, pas
  // une attente: rien à l'écran ne le présente comme un manque.
  const [envyLine, setEnvyLine] = React.useState<string | null>(null);
  const [meal, setMeal] = React.useState<HouseholdMealView | null>(null);
  // `null` = pas encore lu. C'est la garde de montage: tant qu'on ne SAIT pas
  // si la ligne `student_goals` existe, on ne rend ni la carte qui la crée ni
  // le bouton de composition qui en dépend.
  const [ownerGoalRow, setOwnerGoalRow] = React.useState<boolean | null>(null);
  /**
   * LES MOMENTS D'UNE JOURNÉE ORDINAIRE — les LIGNES de la grille de présence.
   *
   * Lus sur la ligne du compte maître, comme tout ce qui gouverne la
   * composition. `[]` tant qu'on n'a pas lu; `loadHouseholdRhythm` retombe sur
   * le défaut du moteur quand rien n'est déclaré, donc la grille a toujours des
   * lignes à montrer dès que la lecture a eu lieu.
   */
  const [rhythm, setRhythm] = React.useState<EatingOccasionSlot[]>([]);
  /**
   * LE GEL (chantier 3, D4). `null` = pas encore lu.
   *
   * ⚠️ L'ÉCRAN NE DÉCIDE PAS DU GEL, il l'affiche. La règle vit en base
   * (`keel_household_is_covered`), la garde vit dans la fonction edge, et ceci
   * n'est que la PHRASE — sans elle, le refus du serveur arriverait comme
   * « non-2xx status code », c'est-à-dire comme une panne.
   */
  const [coverage, setCoverage] = React.useState<HouseholdCoverage | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const weekStart = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  /**
   * L'ANCRE DES ENVIES, ET CE N'EST PAS `weekStart` CI-DESSUS.
   *
   * `weekStart` porte AUJOURD'HUI (c'est ce que `loadHouseholdMeal` attend: la
   * composition courante est celle dont la fenêtre couvre ce jour). La ligne
   * d'envies, elle, est ancrée au LUNDI ISO — sinon une phrase écrite lundi
   * serait relue « rien écrit » mardi, et la composition ne la trouverait pas
   * non plus. La base recale à l'écriture; on recale ici aussi parce que la
   * RELECTURE filtre en SQL sur la valeur rangée.
   */
  const envyWeek = React.useMemo(() => weekStartFor(weekStart, "mon"), [weekStart]);

  /**
   * LES COLONNES DE LA GRILLE DE PRÉSENCE — la fenêtre que le foyer va cuisiner.
   *
   * LA MÊME QUE `ComposeCard` (`until_sunday`), et ce n'est pas un détail: une
   * grille qui montrerait sept jours quand la composition en couvre trois
   * ferait marquer une absence sur des jours que le plan ne verra jamais. On
   * passe donc par la MÊME résolution que le bouton, pas par un calcul voisin.
   *
   * ⚠️ LA GRILLE NE MONTRE QUE LA FENÊTRE, ET C'EST TOUT LE POINT DE SA FUSION:
   * `MealPickerGrid.save` reprend tels quels les jours hors fenêtre, sinon
   * marquer un week-end effacerait « jeudi midi ».
   */
  const awayWindow = React.useMemo(() => {
    const { startsOn, durationDays } = resolveRequestedWindow(
      { kind: "until_sunday" },
      weekStart,
    );
    const n = Math.min(MAX_WINDOW_DAYS, Math.max(1, durationDays));
    return {
      tokens: windowDayOrder(startsOn, n),
      dates: Array.from({ length: n }, (_, i) => addDays(startsOn, i)),
    };
  }, [weekStart]);

  const refresh = React.useCallback(async () => {
    if (!userId) return;
    try {
      const hh = await loadHousehold(userId);
      setHousehold(hh);
      if (hh) {
        setRestrictions(await loadRestrictions());
        setAllergies(await loadAllergies());
        setEnvyLine(await loadEnvyLine(envyWeek));
        setMeal(await loadHouseholdMeal(weekStart));
        setOwnerGoalRow(await hasOwnerGoalRow(userId));
        // SEUL LE MAÎTRE MARQUE UNE PRÉSENCE, donc seul lui a besoin des
        // lignes de la grille — et lui seul peut les lire: RLS sur
        // `student_goals` ne rend que SA ligne. Le demander pour un membre
        // rendrait `null`, puis le défaut, c'est-à-dire une lecture inutile.
        if (hh.me?.role === "owner") setRhythm(await loadHouseholdRhythm(userId));
        // APRÈS les lectures de contenu, et c'est le sujet: elles ne dépendent
        // PAS du gel. On gèle la production, pas la consultation — les bouches,
        // les allergies, les envies et le plan courant se lisent gelés ou non.
        setCoverage(await loadMyHouseholdCoverage());
      }
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
    // ⚠️ `envyWeek` DOIT être dans les dépendances, et ce n'est pas de
    // l'hygiène de linter. Le lot 5 vient de corriger en base exactement cette
    // classe de défaut — une envie rangée au lundi mais relue avec la date du
    // jour, donc introuvable dès le mardi. Une fermeture périmée ici referait
    // le même trou côté écran : le lundi capturé au montage survivrait au
    // passage à la semaine suivante, et la carte lirait la mauvaise ligne sans
    // qu'aucune erreur ne se produise.
  }, [userId, weekStart, envyWeek]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = React.useCallback(
    async (action: () => Promise<{ ok: boolean; reason: string }>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await action();
        // LE MOTIF DE REFUS EST TRADUIT PAR UNE LISTE FERMÉE, et rendu tel quel
        // s'il n'y est pas. Afficher `household_full` à quelqu'un n'est pas une
        // information; afficher « une erreur est survenue » non plus.
        if (!res.ok) setError(householdErrorText(res.reason) ?? res.reason);
        await refresh();
        return res.ok;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  if (phase === "loading") {
    return (
      <KeelAppShell title={t("household.title")}>
        <div className="p-4 text-sm text-neutral-500">…</div>
      </KeelAppShell>
    );
  }

  // Extrait AVANT le rendu: `household.me` est une propriété d'un état, donc
  // le rétrécissement de type ne survit pas à l'entrée dans une closure JSX.
  const me = household?.me ?? null;
  const isOwner = me?.role === "owner";
  // ⚠️ `=== true`, PAS `?.frozen`. Tant que la lecture n'a pas eu lieu
  // (`null`), on ne gèle rien à l'écran: annoncer une pause à quelqu'un qui
  // paie sur la foi d'une lecture en cours est le pire des deux sens.
  const frozen = coverage?.frozen === true;
  // LA COMPOSITION EST LA PRODUCTION, donc elle tombe avec le gel. Le reste de
  // l'écran ne bouge pas d'un pixel: c'est ce que D4 dit, et c'est ce que le
  // foyer doit retrouver intact s'il revient dans trois mois.
  const canCompose = ownerGoalRow === true && !frozen;

  return (
    <KeelAppShell title={t("household.title")}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
        {error ? (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        {!household
          ? <CreateCard busy={busy} onCreate={(n) => run(() => createHousehold(n))} />
          : (
            <>
              {/* EN PREMIER QUAND ELLE EXISTE. Un refus qu'on découvre en
                  cliquant est un refus qu'on prend pour une panne. */}
              {frozen ? <PausedCard isOwner={isOwner} /> : null}

              {/* LA PREMIÈRE BOUCHE EN PREMIER. Tant que la ligne d'objectif
                  du compte maître n'existe pas, la composition échouerait —
                  autant le lui dire AVANT qu'il saisisse trois personnes. */}
              {me && ownerGoalRow !== null ? (
                <MeCard
                  me={me}
                  // ⚠️ LA PROMESSE N'EST FAITE QU'À QUI PEUT LA TENIR. « ceci
                  // débloque la composition » est vrai pour le compte maître et
                  // FAUX pour un profil réclamé, qui ne compose pas. Sa ligne
                  // `student_goals` reste écrite (c'est la sienne), mais la
                  // carte ne lui raconte pas qu'elle ouvre une porte fermée.
                  needsGoalRow={isOwner && !ownerGoalRow}
                  // D1: on n'offre le champ que tant que SA ligne n'existe pas
                  // — pour le maître comme pour un profil réclamé. Après, elle
                  // se modifie dans son « about you », pas ici.
                  goalEditable={!ownerGoalRow}
                  busy={busy}
                  onSave={(patch) =>
                    saveMember(me, patch, {
                      userId,
                      alsoCreateGoalRow: !ownerGoalRow,
                    })}
                />
              ) : null}

              {isOwner ? (
                <AddMouthCard
                  count={household.members.length}
                  busy={busy}
                  onAdd={(first, birth, goal) =>
                    run(() => addHouseholdMember(first, birth, goal))}
                />
              ) : null}

              <MembersCard
                household={household}
                restrictions={restrictions}
                allergies={allergies}
                busy={busy}
                rhythm={rhythm}
                awayWindow={awayWindow}
                onSaveAway={(memberId, next) => run(() => setMemberAway(memberId, next))}
                onSave={(member, patch) => saveMember(member, patch, { userId })}
                onRemove={(memberId) => run(() => removeHouseholdMember(memberId))}
                onDetach={(memberId) => run(() => detachHouseholdMember(memberId))}
                onAddAllergy={(m, l) => run(() => addAllergy(m, l))}
                onRemoveAllergy={(id) => run(() => removeAllergy(id))}
                onAddRestriction={(m, l) => run(() => addRestriction(m, l))}
                onRemoveRestriction={(id) => run(() => removeRestriction(id))}
              />

              <EnvyCard
                household={household}
                line={envyLine}
                busy={busy}
                onSubmit={(body) => run(() => submitEnvy(envyWeek, body))}
              />
              {canCompose ? <ComposeCard household={household} onDone={refresh} /> : null}
              {meal ? <TableCard meal={meal} /> : null}
              <InviteCard household={household} busy={busy} />
            </>
          )}
      </div>
    </KeelAppShell>
  );

  /**
   * LES TROIS CHAMPS D'UNE BOUCHE, ÉCRITS PAR TROIS PORTES ÉTROITES.
   *
   * Une seule RPC « set_identity(prénom, date, objectif) » serait plus courte
   * et FAUSSE: le roster ne rend jamais la date de naissance, donc un écran ne
   * peut pas la préremplir, et l'envoyer avec le prénom l'effacerait à chaque
   * correction de prénom. D'où la règle d'ici — un champ vide ne s'écrit PAS.
   *
   * L'ordre compte: la date d'abord, l'objectif ensuite. Un objectif posé sur
   * une bouche dont l'âge est encore inconnu ne s'applique pas, et le relire
   * dans la foulée afficherait « enregistré, pas appliqué » alors que la date
   * vient d'être donnée.
   */
  async function saveMember(
    member: HouseholdMemberView,
    patch: { firstName: string; birthDate: string | null; goal: MemberGoal | null },
    opts: { userId: string; alsoCreateGoalRow?: boolean },
  ): Promise<boolean> {
    return await run(async () => {
      if (patch.firstName.trim() && patch.firstName.trim() !== member.displayName) {
        const named = await setMemberName(member.memberId, patch.firstName.trim());
        if (!named.ok) return named;
      }
      if (patch.birthDate) {
        // ── D18 (L9) · MA DATE VA DANS MON PROFIL, PAS SUR MA FICHE ────────
        //
        // Depuis 20260812180000, l'âge d'une bouche QUI A UN COMPTE se résout
        // sur `profiles.birth_date` d'abord. Écrire la mienne sur ma fiche de
        // foyer ferait un champ qui enregistre et ne change rien dès que mon
        // « about you » porte une date — donc un champ décoratif, exactement
        // ce que ce chantier répare partout ailleurs.
        //
        // ⚠️ SEULEMENT LA MIENNE. RLS ne laisse écrire que son propre profil:
        // pour la date de quelqu'un d'autre — un enfant, un conjoint qui n'est
        // jamais passé par son écran — la fiche reste la seule porte, et le
        // repli SQL la fait compter.
        const dated = birthDateDoor(member, opts.userId) === "own_profile"
          ? await setOwnBirthDate(opts.userId, patch.birthDate)
          : await setMemberBirthDate(member.memberId, patch.birthDate);
        if (!dated.ok) return dated;
      }
      // D1 (2026-08-11) — `keel_household_set_member_goal` REFUSE désormais
      // toute bouche qui a un compte (`has_account`). L'appeler quand même
      // ferait échouer l'enregistrement du prénom et de la date, qui eux
      // viennent de passer: une carte cassée par un champ qu'on n'aurait pas
      // dû soumettre. Pour un titulaire, la seule écriture d'objectif permise
      // depuis cet écran est la CRÉATION de sa ligne, juste en dessous.
      if (member.userId === null && patch.goal !== member.goal) {
        const aimed = await setMemberGoal(member.memberId, patch.goal);
        if (!aimed.ok) return aimed;
      }
      // LA LIGNE QUI SUPPRIME LA FALAISE. Elle n'est écrite QUE si elle
      // n'existe pas: la table porte des CHECK croisés entre l'objectif et les
      // cibles chiffrées, et écraser `goal` ici ferait échouer l'écriture chez
      // ceux qui ont déjà rempli une cible sur `/app/plan`.
      if (opts.alsoCreateGoalRow && patch.goal) {
        await createOwnerGoalRow(opts.userId, patch.goal);
      }
      return { ok: true, reason: "" };
    });
  }
}

function CreateCard(
  { busy, onCreate }: { busy: boolean; onCreate: (name: string) => void },
) {
  const [name, setName] = React.useState("");
  // ── LE CHOIX DU MODE A DISPARU (lot 2, 2026-08-10) ────────────────────────
  // Il fallait cocher « famille » ou « colocation », et ce choix gouvernait le
  // droit de restreindre et la visibilité des objectifs. La colocation est
  // sortie du produit: un foyer est un foyer, et la personne qui cuisine
  // gouverne le menu. Un écran de moins, une question de moins, et surtout plus
  // aucune façon de se tromper de mode en s'inscrivant.

  return (
    <Card>
      <SectionLabel>{t("household.empty.title")}</SectionLabel>
      <p className="mb-3 text-sm text-neutral-600">{t("household.empty.body")}</p>
      <Field label={t("household.create.name")}>
        <input
          className={inputClass}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Button
        className="mt-3"
        disabled={busy || !name.trim()}
        onClick={() => onCreate(name.trim())}
      >
        {t("household.create.submit")}
      </Button>
    </Card>
  );
}

/** Ce qu'un formulaire de bouche porte. Un seul type pour les trois usages. */
interface MouthDraft {
  firstName: string;
  /** `""` = « ne touche pas ». Voir `saveMember`: le roster ne rend pas la date. */
  birthDate: string;
  goal: MemberGoal | "";
}

/**
 * LES TROIS CHAMPS, UNE SEULE FOIS DANS LE FICHIER.
 *
 * Le maître se décrit avec, on ajoute une bouche avec, et on corrige une bouche
 * avec. Trois copies de ce bloc divergeraient sur le seul détail qui compte —
 * ce qu'on fait d'un champ vide — et personne ne saurait laquelle est la règle.
 */
function MouthFields(
  { draft, onChange, mine, showKeptDateHint, goalEditable = true }: {
    draft: MouthDraft;
    onChange: (next: MouthDraft) => void;
    /** Change le libellé de l'objectif, rien d'autre. */
    mine?: boolean;
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
            <select
              className={inputClass}
              value={draft.goal}
              onChange={(e) =>
                onChange({ ...draft, goal: e.target.value as MemberGoal | "" })}
            >
              <option value="">{t("household.member.goal_none")}</option>
              {MEMBER_GOALS.map((g) => (
                <option key={g} value={g}>{goalLabel(g)}</option>
              ))}
            </select>
          )
          : (
            <p className="text-sm text-neutral-700">
              {draft.goal
                ? goalLabel(draft.goal as MemberGoal)
                : t("household.member.goal_none")}
            </p>
          )}
      </Field>
    </div>
  );
}

/**
 * MOI, CONVIVE — la première carte de l'écran.
 *
 * Elle porte la ligne membre du compte maître ET, la première fois seulement,
 * sa ligne `student_goals`. C'est cette seconde écriture qui supprime la
 * falaise: sans elle, `generate-household-meal-v1` rend `goal_required` (409),
 * et on le découvrait après avoir saisi tout le foyer.
 */
function MeCard(
  { me, needsGoalRow, goalEditable, busy, onSave }: {
    me: HouseholdMemberView;
    needsGoalRow: boolean;
    /**
     * D1 — l'objectif d'un titulaire vit dans son « about you ». On ne l'offre
     * ICI que tant que sa ligne `student_goals` N'EXISTE PAS: c'est la
     * CRÉATION qui supprime la falaise. Une fois la ligne écrite, elle se
     * modifie sur `/app/plan`, et ce champ devient une lecture.
     */
    goalEditable: boolean;
    busy: boolean;
    onSave: (patch: {
      firstName: string;
      birthDate: string | null;
      goal: MemberGoal | null;
    }) => Promise<boolean>;
  },
) {
  const [draft, setDraft] = React.useState<MouthDraft>({
    firstName: me.displayName === "—" ? "" : me.displayName,
    birthDate: "",
    goal: (me.goal as MemberGoal | null) ?? "",
  });
  const [saved, setSaved] = React.useState(false);

  return (
    <Card tone={needsGoalRow ? "warning" : "default"}>
      <SectionLabel>{t("household.me.title")}</SectionLabel>
      <p className="mb-3 text-sm text-neutral-600">
        {needsGoalRow ? t("household.me.unlock") : t("household.me.body")}
      </p>
      <MouthFields
        draft={draft}
        onChange={(next) => {
          setSaved(false);
          setDraft(next);
        }}
        mine
        showKeptDateHint={me.ageState !== "unknown"}
        goalEditable={goalEditable}
      />
      {/* L'INCITATION À COMPLÉTER EST INTÉGRÉE, et elle est vraie: un objectif
          posé sur une bouche sans âge est enregistré et NON APPLIQUÉ
          (`goalApplies`). Le taire ferait un champ qui ne fait rien. */}
      {me.goal && me.ageState === "unknown" ? (
        <p className="mt-2 text-sm text-amber-800">
          {t("household.member.goal_inactive")}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-3">
        <Button
          variant="primary"
          disabled={busy || !draft.firstName.trim()}
          onClick={async () => {
            const ok = await onSave({
              firstName: draft.firstName,
              birthDate: draft.birthDate || null,
              goal: draft.goal || null,
            });
            setSaved(ok);
            if (ok) setDraft((d) => ({ ...d, birthDate: "" }));
          }}
        >
          {t("household.member.save")}
        </Button>
        {saved ? (
          <span className="text-sm text-neutral-500">{t("household.member.saved")}</span>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * AJOUTER UNE BOUCHE — le geste que tout ce chantier existe pour permettre.
 *
 * Le formulaire NE SE FERME PAS après un ajout: il se vide et garde le focus.
 * Trois personnes d'affilée sans quitter le flux est la mesure de ce lot, et
 * une carte qui se replie à chaque succès la rate.
 */
function AddMouthCard(
  { count, busy, onAdd }: {
    count: number;
    busy: boolean;
    onAdd: (
      firstName: string,
      birthDate: string | null,
      goal: MemberGoal | null,
    ) => Promise<boolean>;
  },
) {
  const empty: MouthDraft = { firstName: "", birthDate: "", goal: "" };
  const [draft, setDraft] = React.useState<MouthDraft>(empty);
  const nameRef = React.useRef<HTMLDivElement>(null);

  // LE PLAFOND REND SON MOTIF. La limite vit en base (`household_full`) et doit
  // tenir face à un appel direct de la RPC; ici on ne fait que la DIRE, et on
  // la dit AVANT le refus plutôt qu'après.
  const full = count >= HOUSEHOLD_MAX_MEMBERS;

  return (
    <Card>
      <SectionLabel>{t("household.add.title")}</SectionLabel>
      <p className="mb-3 text-sm text-neutral-600">{t("household.add.body")}</p>
      {full ? (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {t("household.add.full")}
        </p>
      ) : (
        <div ref={nameRef}>
          <MouthFields draft={draft} onChange={setDraft} />
          <Button
            className="mt-3"
            variant="primary"
            disabled={busy || !draft.firstName.trim()}
            onClick={async () => {
              const ok = await onAdd(
                draft.firstName.trim(),
                draft.birthDate || null,
                draft.goal || null,
              );
              if (!ok) return;
              setDraft(empty);
              nameRef.current?.querySelector("input")?.focus();
            }}
          >
            {t("household.add.submit")}
          </Button>
        </div>
      )}
    </Card>
  );
}

/**
 * QUI MANGE ICI — la liste, et pour le compte maître, l'endroit où l'on corrige.
 *
 * La carte de restrictions séparée a disparu: elle demandait « pour qui ? »
 * dans un sélecteur alors que la personne est déjà la ligne qu'on regarde. Ce
 * qu'elle portait est ici, PAR BOUCHE, avec la question qui manquait — de
 * quelle nature est cette contrainte.
 */
function MembersCard(
  { household, restrictions, allergies, busy, rhythm, awayWindow, onSaveAway, onSave, onRemove, onDetach, onAddAllergy, onRemoveAllergy, onAddRestriction, onRemoveRestriction }: {
    household: HouseholdView;
    restrictions: RestrictionView[];
    allergies: AllergyView[];
    busy: boolean;
    /** Les LIGNES de la grille de présence — les moments d'une journée. */
    rhythm: EatingOccasionSlot[];
    /** Les COLONNES: la fenêtre que la composition va couvrir. */
    awayWindow: { tokens: string[]; dates: string[] };
    onSaveAway: (memberId: string, away: AwayDay[]) => Promise<boolean>;
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
        <SectionLabel>{t("household.members.title")}</SectionLabel>
        <ul className="mb-3 flex flex-col gap-2">
          {household.members.map((m) => <MemberBadges key={m.memberId} member={m} />)}
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
                  <span className="text-neutral-600">
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
      </Card>
    );
  }

  return (
    <Card>
      <SectionLabel>{t("household.members.title")}</SectionLabel>
      <ul className="flex flex-col divide-y divide-gray-100">
        {household.members.map((m) => (
          <MemberRow
            key={m.memberId}
            member={m}
            isMe={m.memberId === me?.memberId}
            allergies={allergies.filter((a) => a.memberId === m.memberId)}
            restrictions={restrictions.filter((r) => r.memberId === m.memberId)}
            busy={busy}
            rhythm={rhythm}
            awayWindow={awayWindow}
            onSaveAway={(next) => onSaveAway(m.memberId, next)}
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
    </Card>
  );
}

function MemberBadges({ member }: { member: HouseholdMemberView }) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{member.displayName}</span>
      {member.role === "owner" ? <Badge>{t("household.members.owner")}</Badge> : null}
      {/* L'ÉTIQUETTE, JAMAIS L'ÂGE. Un enfant n'a pas à voir son âge affiché sur
          un écran que tout le foyer regarde.
          ⚠️ `unknown` ne porte AUCUNE étiquette: écrire « adulte » par défaut
          affirmerait un fait qu'on n'a pas. */}
      {member.ageState === "minor" ? <Badge>{t("household.members.child")}</Badge> : null}
    </li>
  );
}

function MemberRow(
  { member, isMe, allergies, restrictions, busy, rhythm, awayWindow, onSaveAway, onSave, onRemove, onDetach, onAddAllergy, onRemoveAllergy, onAddRestriction, onRemoveRestriction }: {
    member: HouseholdMemberView;
    isMe: boolean;
    allergies: AllergyView[];
    restrictions: RestrictionView[];
    busy: boolean;
    rhythm: EatingOccasionSlot[];
    awayWindow: { tokens: string[]; dates: string[] };
    onSaveAway: (away: AwayDay[]) => Promise<boolean>;
    onSave: (
      patch: { firstName: string; birthDate: string | null; goal: MemberGoal | null },
    ) => Promise<boolean>;
    onRemove: () => void;
    onDetach: () => void;
    onAddAllergy: (label: string) => void;
    onRemoveAllergy: (id: string) => void;
    onAddRestriction: (label: string) => void;
    onRemoveRestriction: (id: string) => void;
  },
) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<MouthDraft>({
    firstName: member.displayName === "—" ? "" : member.displayName,
    birthDate: "",
    goal: (member.goal as MemberGoal | null) ?? "",
  });
  // LA NATURE EST DEMANDÉE, PAS DEVINÉE. Les deux libellés vont dans deux
  // tables différentes et n'ont pas le même effet sur le repas.
  const [kind, setKind] = React.useState<"allergy" | "house_rule">("allergy");
  const [label, setLabel] = React.useState("");
  const [awayOpen, setAwayOpen] = React.useState(false);

  /** Combien de moments sont marqués DANS la fenêtre — pour le bouton. */
  const awayInWindow = React.useMemo(() => {
    const inWindow = new Set(awayWindow.tokens);
    const slots = rhythm.length;
    return member.awayHousehold
      .filter((a) => inWindow.has(a.day))
      .reduce((n, a) => n + (a.slots.length === 0 ? slots : a.slots.length), 0);
  }, [member.awayHousehold, awayWindow.tokens, rhythm.length]);

  /** Ce que la personne a dit d'elle-même, dans la fenêtre. LECTURE SEULE. */
  const selfInWindow = React.useMemo(() => {
    const inWindow = new Set(awayWindow.tokens);
    return member.awaySelf.filter((a) => inWindow.has(a.day));
  }, [member.awaySelf, awayWindow.tokens]);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{member.displayName}</span>
        {member.role === "owner" ? <Badge>{t("household.members.owner")}</Badge> : null}
        {member.ageState === "minor" ? <Badge>{t("household.members.child")}</Badge> : null}
        {member.goal ? <Badge>{goalLabel(member.goal as MemberGoal)}</Badge> : null}
        {allergies.map((a) => (
          <span key={a.id} className="rounded bg-red-50 px-2 py-0.5 text-red-800">
            {a.label}
          </span>
        ))}
        {restrictions.map((r) => (
          <span key={r.id} className="rounded bg-neutral-100 px-2 py-0.5 text-neutral-600">
            {r.label}
          </span>
        ))}
        <button
          className="ml-auto text-neutral-500 underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t("household.member.close") : t("household.member.edit")}
        </button>
      </div>

      {open ? (
        <div className="mt-3 flex flex-col gap-3 rounded-lg bg-gray-50 p-3">
          <MouthFields
            draft={draft}
            onChange={setDraft}
            mine={isMe}
            showKeptDateHint={member.ageState !== "unknown"}
            // D1 — une bouche qui a un compte règle son objectif elle-même.
            goalEditable={member.userId === null}
          />
          {member.goal && member.ageState === "unknown" ? (
            <p className="text-sm text-amber-800">
              {t("household.member.goal_inactive")}
            </p>
          ) : null}

          {/* ── D14 · QUAND CETTE BOUCHE N'EST PAS LÀ ──────────────────────
              LA GRILLE EST CELLE DU CONSTRUCTEUR, pas une seconde. Deux
              grilles pour la même question divergeraient sur le seul détail
              qui compte — ce que « tout décoché » veut dire — et c'est celle
              qu'on regarde le moins qui garderait l'ancienne règle.

              CE QU'ELLE MONTRE ET ÉCRIT EST LA MARQUE DU MAÎTRE, JAMAIS
              L'UNION. La grille réécrit ce qu'on lui donne: nourrie de
              l'union, elle recopierait la déclaration de la personne dans la
              colonne du foyer, où elle survivrait à sa rétractation. */}
          <div className="border-t border-gray-200 pt-3">
            <SectionLabel>{t("household.away.title")}</SectionLabel>
            <p className="mb-2 text-xs text-neutral-500">
              {t("household.away.hint")}
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setAwayOpen(true)}
            >
              {awayInWindow === 0
                ? t("household.away.open")
                : t("household.away.open_count", { n: String(awayInWindow) })}
            </Button>
            {/* CE QUE LA PERSONNE A DIT ELLE-MÊME, en lecture seule. Sans cette
                ligne, le maître verrait sa propre marque et pas le FAIT: il
                remarquerait une assiette manquante sans pouvoir dire d'où elle
                vient — et re-marquerait par-dessus. */}
            {selfInWindow.length > 0 ? (
              <p className="mt-2 text-xs text-neutral-600">
                {t("household.away.self_declared", {
                  days: selfInWindow.map((a) => a.day).join(", "),
                })}
              </p>
            ) : null}
          </div>

          {/* MONTÉE MÊME FERMÉE — `Modal` rend `null` sans démonter — donc une
              grille modifiée survit à une fermeture accidentelle. */}
          <MealPickerGrid
            open={awayOpen}
            onClose={() => setAwayOpen(false)}
            days={awayWindow.tokens}
            dates={awayWindow.dates}
            rhythm={rhythm}
            away={member.awayHousehold}
            busy={busy}
            onSave={async (next) => {
              const ok = await onSaveAway(next);
              if (ok) setAwayOpen(false);
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={busy || !draft.firstName.trim()}
              onClick={async () => {
                const ok = await onSave({
                  firstName: draft.firstName,
                  birthDate: draft.birthDate || null,
                  goal: draft.goal || null,
                });
                if (ok) setDraft((d) => ({ ...d, birthDate: "" }));
              }}
            >
              {t("household.member.save")}
            </Button>
            {/* DEUX GESTES, DEUX LIBELLÉS, JAMAIS UN SEUL BOUTON (chantier 2).
                « Retirer l'accès » DÉTACHE: la personne perd la lecture du
                foyer, et reste une bouche à table avec sa portion et ses
                allergies. « Retirer du foyer » SUPPRIME la ligne. Un seul
                bouton « retirer » voudrait dire deux choses irréversibles
                différentes selon la ligne qu'on regarde.

                LE MAÎTRE NE SE RETIRE PAS, ET NE SE DÉTACHE PAS. La base
                refuse les deux (`cannot_remove_owner`, `cannot_detach_owner`)
                parce qu'un foyer sans personne pour composer laisse ses
                bouches sans compte sans recours; l'écran ne montre pas un
                bouton qui sera refusé. */}
            {member.role !== "owner" && member.userId ? (
              <Button variant="secondary" disabled={busy} onClick={onDetach}>
                {t("household.member.detach")}
              </Button>
            ) : null}
            {member.role !== "owner" ? (
              <Button variant="danger" disabled={busy} onClick={onRemove}>
                {t("household.member.remove")}
              </Button>
            ) : null}
          </div>
          {/* Les deux gestes ne se distinguent pas par leur couleur: on ÉCRIT
              ce que chacun fait, à côté d'eux, au moment de choisir. */}
          {member.role !== "owner" ? (
            <p className="text-xs text-neutral-500">
              {member.userId
                ? t("household.member.detach_hint")
                : t("household.member.remove_hint")}
            </p>
          ) : null}

          <div className="border-t border-gray-200 pt-3">
            <Field
              label={t("household.constraint.kind")}
              hint={kind === "allergy"
                ? t("household.constraint.kind.allergy_hint")
                : t("household.constraint.kind.house_rule_hint")}
            >
              <select
                className={inputClass}
                value={kind}
                onChange={(e) => setKind(e.target.value as "allergy" | "house_rule")}
              >
                <option value="allergy">{t("household.constraint.kind.allergy")}</option>
                <option value="house_rule">
                  {t("household.constraint.kind.house_rule")}
                </option>
              </select>
            </Field>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className={`${inputClass} min-w-0 flex-1`}
                value={label}
                maxLength={120}
                placeholder={kind === "allergy"
                  ? t("household.allergy.placeholder")
                  : t("household.restriction.placeholder")}
                onChange={(e) => setLabel(e.target.value)}
              />
              <Button
                disabled={busy || !label.trim()}
                onClick={() => {
                  const value = label.trim();
                  setLabel("");
                  if (kind === "allergy") onAddAllergy(value);
                  else onAddRestriction(value);
                }}
              >
                {kind === "allergy"
                  ? t("household.allergy.add")
                  : t("household.restriction.add")}
              </Button>
            </div>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {allergies.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-red-800">{a.label}</span>
                  <span className="text-neutral-500">
                    {t("household.constraint.kind.allergy")}
                  </span>
                  <button
                    className="text-neutral-500 underline"
                    disabled={busy}
                    onClick={() => onRemoveAllergy(a.id)}
                  >
                    {t("household.allergy.remove")}
                  </button>
                </li>
              ))}
              {restrictions.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-neutral-500">
                    {t("household.constraint.kind.house_rule")}
                  </span>
                  <button
                    className="text-neutral-500 underline"
                    disabled={busy}
                    onClick={() => onRemoveRestriction(r.id)}
                  >
                    {t("household.restriction.remove")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * LES ENVIES DE LA SEMAINE — UNE LIGNE, ÉCRITE PAR LE COMPTE MAÎTRE (lot 5).
 *
 * ── CE QUE CETTE CARTE NE FAIT PLUS, ET POURQUOI ON NE LE REMET PAS ───────
 * Elle demandait à CHACUN de déposer son envie, et affichait « 2 ont parlé ·
 * 3 n'ont rien dit ». Les deux sont partis avec le conseil de famille:
 *
 *   — le décompte se lisait « il en reste 3 à relancer », quoi qu'en dise la
 *     copie à côté — c'est-à-dire exactement la charge mentale que le produit
 *     promet de supprimer;
 *   — et Sophia arbitrant publiquement entre un parent et son enfant est un
 *     marécage.
 *
 * Ce qui reste: une phrase, écrite pour tout le monde. « Léa veut des pâtes,
 * Marc en a marre du poulet. »
 *
 * ── UN SEUL AUTEUR, ET LE REFUS VIT EN BASE ──────────────────────────────
 * La carte n'apparaît que pour le compte maître. Ce n'est PAS la garde: la
 * RPC refuse tout autre membre par `not_owner` (une limite d'UI n'est pas une
 * limite). L'écran ne montre simplement pas un champ dont l'envoi serait
 * refusé.
 */
function EnvyCard(
  { household, line, busy, onSubmit }: {
    household: HouseholdView;
    /** `null` = rien d'écrit cette semaine. Un état, pas un manque. */
    line: string | null;
    busy: boolean;
    onSubmit: (body: string) => void;
  },
) {
  // ⚠️ INSTANTANÉ DE MONTAGE. Il est sûr parce que l'écran entier ne rend rien
  // tant que `phase === "loading"`, et que la ligne est lue dans le même
  // `refresh()` que le foyer: la carte ne peut pas se monter sur du vide puis
  // l'écraser au Save.
  const [body, setBody] = React.useState(line ?? "");

  if (household.me?.role !== "owner") return null;

  return (
    <Card>
      <SectionLabel>{t("household.envy.title")}</SectionLabel>
      <p className="mb-3 text-sm text-neutral-600">{t("household.envy.body")}</p>
      <textarea
        className={`${inputClass} min-h-[80px]`}
        value={body}
        maxLength={ENVY_MAX_CHARS}
        placeholder={t("household.envy.placeholder")}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button disabled={busy || !body.trim()} onClick={() => onSubmit(body.trim())}>
          {t("household.envy.save")}
        </Button>
      </div>
    </Card>
  );
}

/*
 * ── LA CARTE DE CONSENTEMENT A ÉTÉ RETIRÉE (lot 2, 2026-08-10) ──────────────
 *
 * Elle permettait à un majeur d'accepter, puis de révoquer, le droit du compte
 * maître de lui poser des interdits. Elle protégeait un adulte d'un autre
 * adulte, dans un monde où chaque bouche avait un compte.
 *
 * Le modèle arrêté le 2026-08-08 dit qu'une seule personne gouverne le menu —
 * c'est ce qui évite le marécage d'un arbitrage entre un parent et son enfant.
 * LA CONTREPARTIE N'EST PAS RIEN, et elle est plus haut dans ce fichier (dans
 * `MembersCard`, côté membre non maître): chaque contrainte reste affichée AVEC
 * QUI L'A POSÉE (`restrictionNotice`). Ce qui distingue ce modèle du contrôle
 * coercitif, c'est que rien n'est secret.
 */

/*
 * ── LA CARTE DES INTERDITS A ÉTÉ RETIRÉE (lot 4, 2026-08-10) ───────────────
 *
 * Elle demandait « pour qui ? » dans un sélecteur, alors que la personne est
 * déjà la ligne qu'on regarde — et elle ne posait PAS la question qui compte:
 * de quelle nature est cette contrainte. Ce qu'elle portait vit maintenant
 * dans `MemberRow`, par bouche, avec le choix allergie / règle de maison.
 *
 * `household.restriction.for_whom` est partie avec elle: son sélecteur n'a
 * plus de sujet.
 */

/**
 * INVITER QUELQU'UN À RÉCLAMER SA LIGNE (lot 6).
 *
 * ── LA QUESTION QUI A CHANGÉ ───────────────────────────────────────────────
 * Cette carte demandait une adresse. Elle demande maintenant DEUX choses, et
 * l'ordre compte: QUI, puis OÙ envoyer. L'invitation attache un compte à une
 * bouche qui existe déjà — si la cible était choisie à l'arrivée, un lien qui
 * fuite deviendrait le droit de se déclarer n'importe qui du foyer.
 *
 * ── LE SÉLECTEUR NE PROPOSE QUE LES BOUCHES LIBRES ─────────────────────────
 * Une ligne qui porte déjà un compte est refusée par la base
 * (`already_claimed`), et proposer un choix qui sera refusé est une promesse
 * qu'on ne tient pas. Quand il n'en reste aucune, la carte le DIT plutôt que
 * d'afficher un menu vide.
 */
function InviteCard(
  { household, busy }: { household: HouseholdView; busy: boolean },
) {
  // UNE BOUCHE LIBRE = pas de compte attaché. C'est la même définition qu'en
  // base (`user_id is null`), et le roster la rend telle quelle.
  const claimable = claimableMembers(household);
  const [memberId, setMemberId] = React.useState(claimable[0]?.memberId ?? "");
  // LA SÉLECTION EST DÉRIVÉE, PAS SEULEMENT INITIALISÉE. La carte ne se démonte
  // pas entre deux rafraîchissements: un `useState` seul garderait la bouche
  // choisie même après qu'elle a été réclamée ou retirée, et le maître enverrait
  // un lien pour quelqu'un d'autre que celui qu'il lit à l'écran.
  const selected = claimable.some((m) => m.memberId === memberId)
    ? memberId
    : (claimable[0]?.memberId ?? "");
  const [email, setEmail] = React.useState("");
  const [invite, setInvite] = React.useState<{ token: string; firstName: string } | null>(
    null,
  );
  const [reason, setReason] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  if (household.me?.role !== "owner") return null;

  return (
    <Card>
      <SectionLabel>{t("household.invite.title")}</SectionLabel>
      <p className="mb-3 text-sm text-neutral-600">{t("household.invite.body")}</p>
      {/* CE QUE LA RÉCLAMATION DONNE, DIT AU MAÎTRE AVANT QU'IL PROMETTE. Il
          est celui qui écrit le message d'accompagnement: s'il annonce « tu
          pourras composer », la base le démentira et c'est lui qui aura menti. */}
      <p className="mb-3 text-sm text-neutral-500">{t("household.invite.grants")}</p>
      {claimable.length === 0 ? (
        <p className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-600">
          {t("household.invite.nobody_left")}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Field
              label={t("household.invite.who")}
              hint={t("household.invite.who_hint")}
            >
              <select
                className={inputClass}
                value={selected}
                onChange={(e) => setMemberId(e.target.value)}
              >
                {claimable.map((m) => (
                  <option key={m.memberId} value={m.memberId}>{m.displayName}</option>
                ))}
              </select>
            </Field>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label={t("household.invite.email")}>
                <input
                  className={`${inputClass} min-w-0`}
                  value={email}
                  type="email"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Button
                disabled={busy || working || !email.trim() || !selected}
                onClick={async () => {
                  setWorking(true);
                  setInvite(null);
                  setReason(null);
                  try {
                    const res = await inviteToHousehold(email.trim(), selected);
                    if (res.ok) {
                      setInvite({
                        token: String(res.token ?? ""),
                        // Le prénom vient de la RÉPONSE, pas de l'état local:
                        // c'est la ligne que la base a réellement visée.
                        firstName: String(res.first_name ?? ""),
                      });
                    } else setReason(res.reason);
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                {t("household.invite.submit")}
              </Button>
            </div>
          </div>
        </>
      )}
      {/* LE JETON N'EST RENDU QU'UNE FOIS, par la RPC. On l'affiche donc en
          entier, ET on nomme la bouche qu'il vise: le maître en émet plusieurs
          dans la même minute, et un lien anonyme part à la mauvaise personne. */}
      {invite ? (
        <div className="mt-3 text-sm">
          <p className="mb-1 text-neutral-600">
            {t("household.invite.link_ready", { name: invite.firstName })}
          </p>
          <code className="block overflow-x-auto rounded bg-neutral-100 p-2 text-xs">
            {`${globalThis.location?.origin ?? ""}/join-household?token=${invite.token}`}
          </code>
        </div>
      ) : null}
      {/* LISTE FERMÉE, et le typecheck l'exige: `t()` n'accepte pas une clé
          construite à la volée. C'est la bonne contrainte — un motif que la
          RPC ajouterait sans étiquette d'affichage casserait la compilation
          plutôt que d'afficher une clé brute à l'utilisateur. */}
      {reason ? (
        <p className="mt-2 text-sm text-neutral-600">{inviteErrorText(reason)}</p>
      ) : null}
    </Card>
  );
}

/** Réexporté pour le test de route: la page monte sans foyer sans exploser. */
export type { HouseholdMemberView };

/**
 * Le motif de refus d'invitation, traduit — liste FERMÉE.
 *
 * Un motif inconnu rend `null` plutôt qu'une clé brute: afficher
 * `household.invite.error.something` à quelqu'un est pire que ne rien
 * afficher, et le silence force à ajouter l'étiquette au lieu de la tolérer.
 */
function inviteErrorText(reason: string): string | null {
  switch (reason) {
    case "rate_limited":
      return t("household.invite.error.rate_limited");
    case "bad_email":
      return t("household.invite.error.bad_email");
    case "not_owner":
      return t("household.invite.error.not_owner");
    // LOT 6 — les deux refus que la CIBLE peut produire. Ils sont rares à
    // l'écran (le sélecteur ne propose que des bouches libres du foyer) et ils
    // arrivent quand même: deux onglets ouverts, ou une bouche réclamée entre
    // le chargement et le clic. Sans étiquette, l'écran afficherait le jeton
    // brut `already_claimed` à quelqu'un.
    case "already_claimed":
      return t("household.invite.error.already_claimed");
    case "not_a_member":
      return t("household.error.not_a_member");
    default:
      return null;
  }
}

/**
 * « TON FOYER EST EN PAUSE » (chantier 3, D4).
 *
 * ── CE QUE CETTE CARTE DOIT DIRE, ET DANS CET ORDRE ───────────────────────
 *   1. RIEN N'EST PERDU. C'est la première phrase parce que c'est la première
 *      peur, et parce que c'est vrai: D4 gèle et n'efface jamais. Les huit
 *      bouches, leurs âges, leurs allergies et leurs objectifs sont là.
 *   2. CE QUI S'ARRÊTE, nommément: on ne compose plus de nouvelle semaine.
 *      Une pause qu'on ne délimite pas se lit comme une panne totale.
 *   3. LE GESTE POUR REPRENDRE. Un écran qui annonce une coupure sans issue
 *      fait ouvrir un ticket au lieu d'un paiement.
 *
 * ── ET CE QU'ELLE NE DIT PAS ──────────────────────────────────────────────
 * Ni la date d'expiration, ni le montant, ni un décompte. La date est
 * derrière le tunnel de Stripe, qui est la source, et l'afficher ici en
 * ferait une seconde — celle qui se trompe le jour où quelqu'un prolonge un
 * essai à la main.
 *
 * ── LE MEMBRE N'EST PAS LE MAÎTRE ─────────────────────────────────────────
 * Un profil réclamé ne peut PAS reprendre l'abonnement: la carte Stripe est
 * celle du maître (`not_household_owner`, 403). Lui montrer un bouton qui sera
 * refusé serait exactement le défaut que ce chantier retire ailleurs — on lui
 * dit l'état, et à qui s'adresser.
 */
function PausedCard({ isOwner }: { isOwner: boolean }) {
  const [working, setWorking] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  return (
    <Card tone="warning">
      <SectionLabel>{t("household.paused.title")}</SectionLabel>
      <p className="text-sm text-amber-900">{t("household.paused.body")}</p>
      <p className="mt-2 text-sm text-amber-900">{t("household.paused.kept")}</p>
      {isOwner
        ? (
          <>
            <Button
              className="mt-3 border-amber-300 text-amber-900 hover:bg-amber-100"
              disabled={working}
              onClick={async () => {
                setWorking(true);
                setFailure(null);
                try {
                  window.location.assign(await openHouseholdCheckout());
                } catch (e) {
                  // LE MOTIF TEL QUEL. Tant qu'un humain n'a pas créé les prix
                  // Stripe, la fonction edge refuse BRUYAMMENT — et « une
                  // erreur est survenue » ne dirait pas que le produit n'est
                  // pas encore en vente.
                  setFailure(e instanceof Error ? e.message : String(e));
                  setWorking(false);
                }
              }}
            >
              {working
                ? t("household.paused.working")
                : t("household.paused.resume_cta")}
            </Button>
            {failure
              ? <p className="mt-2 text-sm text-amber-900">{failure}</p>
              : null}
          </>
        )
        : (
          <p className="mt-2 text-sm text-amber-900">
            {t("household.paused.owner_only")}
          </p>
        )}
    </Card>
  );
}

function ComposeCard(
  { household, onDone }: { household: HouseholdView; onDone: () => Promise<void> },
) {
  const [working, setWorking] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  // SEUL LE COMPTE MAÎTRE COMPOSE. Ce n'est pas une hiérarchie de confort: la
  // composition RETIRE le plan courant de la personne pour qui elle est écrite,
  // donc laisser n'importe quel membre la déclencher laisserait un colocataire
  // effacer la semaine d'un autre. La fonction edge refuse déjà (403); l'écran
  // ne montre pas un bouton qui sera refusé.
  if (household.me?.role !== "owner") return null;

  return (
    <Card>
      <SectionLabel>{t("household.compose.title")}</SectionLabel>
      <p className="mb-3 text-sm text-neutral-600">{t("household.compose.body")}</p>
      <Button
        disabled={working}
        onClick={async () => {
          setWorking(true);
          setFailure(null);
          try {
            // LA COMPOSITION NE REND PLUS DE DÉCOMPTE DE SILENCIEUX (lot 5).
            // Rien ne le remplace ici: une phrase « personne n'a rien demandé
            // cette semaine » remettrait le reproche de silence que ce lot
            // retire, sous une autre forme.
            await generateHouseholdMeal({
              window: { kind: "until_sunday" },
              intent: "prepare_next",
            });
            await onDone();
          } catch (e) {
            // LE MOTIF NOMMÉ, TRADUIT. `generateHouseholdMeal` remonte
            // désormais le jeton du serveur (`household_frozen`) plutôt que
            // « non-2xx status code ». La course existe: l'écran a lu sa
            // couverture, l'essai a expiré entre-temps, on clique. Sans cette
            // ligne, ce cas-là — le seul où le refus arrive par surprise — se
            // lirait comme une panne.
            const raw = e instanceof Error ? e.message : String(e);
            setFailure(
              raw === "household_frozen" ? t("household.paused.body") : raw,
            );
          } finally {
            setWorking(false);
          }
        }}
      >
        {working ? t("household.compose.working") : t("household.compose.submit")}
      </Button>
      {failure ? <p className="mt-2 text-sm text-red-700">{failure}</p> : null}
    </Card>
  );
}

/**
 * À TABLE — qui met quoi dans son assiette.
 *
 * ── POURQUOI ICI ET PAS SUR `/app/plan` ───────────────────────────────────
 * Le plan montre ce qu'on CUISINE; ceci montre comment on SERT. Et c'est la
 * seule vue du produit qui n'a de sens qu'à plusieurs — la mettre sur le plan
 * ferait porter un bloc vide au chemin individuel, qui est le majoritaire.
 *
 * ── AUCUNE RAISON N'EST AFFICHÉE, PARCE QU'IL N'Y EN A PAS ────────────────
 * `portion_note` est une INSTRUCTION DE SERVICE, garantie sans raison ni
 * vocabulaire de corps par `sanitizePortionNote` côté serveur. C'est ce qui
 * permet d'afficher toute la table à tout le monde: l'instruction est
 * publique, le pourquoi ne l'est pas.
 */
function TableCard({ meal }: { meal: HouseholdMealView }) {
  if (meal.portions.length === 0) return null;
  return (
    <Card>
      <SectionLabel>{t("household.portions.title")}</SectionLabel>
      <ul className="flex flex-col gap-3">
        {meal.portions.map((p) => (
          <li key={p.memberId}>
            <p className="text-sm">
              <span className="font-medium">{p.displayName}</span>
              {" — "}
              <span className="text-neutral-600">
                {p.portionNote ?? t("household.portions.standard")}
              </span>
            </p>
            {p.shares.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-0.5 pl-4 text-sm text-neutral-500">
                {p.shares.map((s) => <li key={s.preparationId}>{s.note}</li>)}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
