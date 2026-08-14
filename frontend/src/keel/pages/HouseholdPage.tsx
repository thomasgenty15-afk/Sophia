import React from "react";

import { useAuth } from "../../context/AuthContext";
// LA LISTE FERMÉE DES QUATRE RÉPONSES, LUE ET PAS RECOPIÉE — la même que
// l'entonnoir. Une seconde liste ici offrirait une case que le moteur n'honore
// pas, ce qui est la version cochable du mensonge que ce lot corrige.
import { DIET_ANSWERS } from "../api/onboarding";
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
  hasOwnerGoalRow,
  type HouseholdCoverage,
  type HouseholdMealView,
  type HouseholdMemberView,
  type HouseholdView,
  inviteToHousehold,
  loadAllergies,
  loadHousehold,
  loadHouseholdMeal,
  loadHouseholdRhythm,
  loadMemberBodies,
  loadMyHouseholdCoverage,
  loadRestrictions,
  MEMBER_GENDERS,
  MEMBER_GOALS,
  type MemberBodyView,
  type MemberGender,
  type MemberGoal,
  mergeCounterparts,
  openHouseholdCheckout,
  removeAllergy,
  removeHouseholdMember,
  removeRestriction,
  type RestrictionView,
  restrictionNotice,
  setMemberAway,
  setMemberBirthDate,
  setMemberBody,
  setMemberDiet,
  setMemberGoal,
  setMemberName,
  setOwnBirthDate,
} from "../api/household";
import { addDays } from "../api/dates";
import {
  type AwayDay,
  EATING_OCCASIONS,
  type EatingOccasion,
  type EatingOccasionSlot,
} from "../api/mealGeneration";
import {
  type HabitSlot,
  loadMemberHabits,
  type MemberHabitsView,
  setMemberHabits,
} from "../api/householdHabits";
import {
  MAX_WINDOW_DAYS,
  resolveRequestedWindow,
  windowDayOrder,
} from "../api/mealWindow";
import { loadMutedMembers, muteMergeProposals } from "../api/householdMerge";
import { householdErrorKey } from "../copy/planRefusals";
import MealPickerGrid from "../components/MealPickerGrid";
import HouseholdHabitsCard from "../components/HouseholdHabitsCard";
import HouseholdMergeCard from "../components/HouseholdMergeCard";
import HouseholdPlanCard from "../components/HouseholdPlanCard";
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
  // ⚠️ LA LISTE A DÉMÉNAGÉ DANS `copy/planRefusals.ts`, et ce n'est pas un
  // rangement. Elle était un `switch` privé de ce fichier, donc invisible à la
  // carte de proposition — qui reçoit pourtant les mêmes motifs et affichait
  // `not_a_member` en toutes lettres (mesuré deux fois en HTTP réel). Une même
  // liste fermée, deux écrans, un seul exemplaire: c'est la raison d'être du
  // module de refus, écrite dans son en-tête.
  //
  // L'ORDRE EST CELUI D'AVANT: les motifs de foyer d'abord, les motifs propres
  // aux deux RPC de réglage de fusion ensuite (`muted_required`,
  // `member_is_owner`, `notice_moved_on`…). `householdErrorKey` le tient, et le
  // test appelle la même fonction que cette ligne.
  const key = householdErrorKey(reason);
  return key ? t(key) : null;
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
   * D17 — LES BOUCHES DONT LE MAÎTRE NE VEUT PLUS VOIR LES PROPOSITIONS.
   *
   * `null` = pas lu, ou lecture impossible — et les deux se traitent pareil à
   * l'écran: pas d'interrupteur. Un interrupteur qui affiche toujours
   * « éteint » se fait basculer deux fois.
   *
   * ⚠️ SEUL LE MAÎTRE PEUT LIRE CETTE TABLE (RLS, policy `owner`), et c'est
   * voulu: un secondaire n'a pas à apprendre qu'on a coupé les propositions qui
   * le concernent.
   */
  const [mutedMembers, setMutedMembers] = React.useState<Set<string> | null>(null);
  /**
   * LE CORPS DE CHAQUE BOUCHE (2026-08-12), par `member_id`.
   *
   * ⚠️ VIDE POUR UN NON-MAÎTRE, et ce n'est pas l'écran qui l'impose:
   * `household_member_bodies` n'a AUCUN grant à `authenticated` et sa RPC de
   * lecture rend zéro ligne à qui n'est pas maître. Sondé avant d'écrire la
   * migration: la policy de `household_members` est household-wide, donc une
   * colonne `poids` posée là-bas aurait été lisible par tout co-membre.
   *
   * Une carte VIDE ne veut donc pas dire « personne n'a de corps »: pour un
   * membre, elle veut dire « ce n'est pas ton affaire ». C'est pour ça que le
   * bloc de saisie ne s'affiche que dans la vue du maître.
   */
  const [bodies, setBodies] = React.useState<Map<string, MemberBodyView>>(new Map());
  /**
   * CE QUE CHAQUE BOUCHE MANGE D'HABITUDE (2026-08-14).
   *
   * ⚠️ `null` VEUT DIRE « PAS ENCORE LU », ET C'EST TOUT LE POINT — pas une
   * carte vide. Une carte vide se lirait « personne n'a d'habitude », et le
   * formulaire monté là-dessus afficherait du vide non lu qu'il ÉCRASERAIT au
   * Save (cicatrice `mount-snapshot-forms-need-a-loading-gate`). La carte
   * reçoit donc `loaded` et n'affiche aucun champ avant.
   *
   * Même discipline de lecture que les corps: la table n'a aucun grant à
   * `authenticated` (spec §G1), donc c'est une RPC, et la demander pour un
   * non-maître rendrait zéro ligne — c'est-à-dire un fait qu'on n'a pas.
   */
  const [habits, setHabits] = React.useState<Map<string, MemberHabitsView> | null>(
    null,
  );
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
  // ⚠️ L'ANCRE DES ENVIES A QUITTÉ CET ÉCRAN AVEC LA CARTE. Elle vit dans le
  // formulaire de demande de `/app/plan`, et elle y est calculée sur la DATE DE
  // DÉPART DU PLAN — pas sur aujourd'hui. C'est ce que le générateur relit
  // (`weekStartOf(starts_on)`), et les deux ancres ne coïncidaient que tant que
  // la fenêtre démarrait forcément aujourd'hui.

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
        setMeal(await loadHouseholdMeal(weekStart));
        setOwnerGoalRow(await hasOwnerGoalRow(userId));
        // SEUL LE MAÎTRE MARQUE UNE PRÉSENCE, donc seul lui a besoin des
        // lignes de la grille — et lui seul peut les lire: RLS sur
        // `student_goals` ne rend que SA ligne. Le demander pour un membre
        // rendrait `null`, puis le défaut, c'est-à-dire une lecture inutile.
        if (hh.me?.role === "owner") {
          setRhythm(await loadHouseholdRhythm(userId));
          // LES CORPS — MAÎTRE SEUL, et pas parce que l'écran le décide:
          // `keel_household_member_bodies` rend zéro ligne à un non-maître, et
          // la table n'a aucun grant à `authenticated`. La demander pour un
          // membre rendrait une carte vide, c'est-à-dire « personne n'a de
          // corps » — un fait qu'on n'a pas.
          setBodies(await loadMemberBodies());
          // ── LES HABITUDES, ET POURQUOI LEUR ÉCHEC NE TUE PAS L'ÉCRAN ─────
          // Elles ne portent RIEN d'autre sur cette page: les bouches, les
          // allergies, les règles de maison, les corps et le plan se lisent et
          // s'écrivent sans elles. Une lecture qui échoue doit donc dégrader
          // LA SEULE CARTE qui en dépend, pas les six autres — sinon un foyer
          // entier perd `/app/household` pour une carte repliée.
          //
          // ⚠️ CE N'EST PAS UN `catch` MUET, et la différence est le `null`.
          // On ne pose PAS une carte vide (« personne n'a d'habitude », un
          // fait qu'on n'a pas): on laisse `null`, c'est-à-dire « pas lu », et
          // la carte n'affiche alors AUCUN champ. Le défaut reste visible en
          // console au lieu de se déguiser en réponse.
          try {
            setHabits(await loadMemberHabits());
          } catch (e) {
            setHabits(null);
            console.error("[household] habits unreadable", e);
          }
          // D17 — même raison que la ligne au-dessus: la table n'est lisible
          // que du maître, et la demander pour un membre rendrait zéro ligne,
          // c'est-à-dire « personne n'est masqué » — un fait qu'on n'a pas.
          setMutedMembers(await loadMutedMembers());
        }
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
  }, [userId, weekStart]);

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
        <div className="p-4 text-sm text-ink-soft">…</div>
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
  // ⚠️ `canCompose` A QUITTÉ CET ÉCRAN AVEC `ComposeCard`. Le gel reste lu ici
  // (`frozen`, ci-dessus, pour la carte de pause); ce qu'il coupait — la
  // production — se demande maintenant depuis `/app/plan`, et le serveur y
  // refuse par `household_frozen`, qui a des mots dans `copy/planRefusals.ts`.

  return (
    <KeelAppShell title={t("household.title")}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
        {error ? (
          // LE ROUGE RESTE, ET LE RAYON CHANGE. Un refus est un ÉTAT du système
          // (charte §2), donc `red-50` / `red-700` — 6,13:1 — ne bouge pas. Le
          // `rounded-md` d'avant était la sixième valeur de rayon de l'écran;
          // le vocabulaire n'en a que deux, et un bandeau est un panneau.
          <div className="rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</div>
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
                mutedMembers={mutedMembers}
                rhythm={rhythm}
                awayWindow={awayWindow}
                bodies={bodies}
                habits={habits}
                // `run` traduit le refus par la liste fermée de
                // `copy/planRefusals.ts` et rafraîchit — donc le formulaire se
                // remonte sur ce que le serveur a VRAIMENT gardé, et un
                // `bad_slots` arrive en phrase, jamais en jeton nu.
                onSaveHabits={(memberId, s, n) =>
                  run(() => setMemberHabits(memberId, s, n))}
                onSaveBody={(memberId, h, w, g) =>
                  run(() => setMemberBody(memberId, h, w, g))}
                // LE RÉGIME D'UNE BOUCHE. Même `run` que les autres: le refus
                // (`bad_diet`, `has_account`) arrive en phrase, et la page se
                // remonte sur ce que la base a VRAIMENT gardé.
                onSaveDiet={(memberId, diet) =>
                  run(() => setMemberDiet(memberId, diet))}
                onMute={(memberId, next) => run(() => muteMergeProposals(memberId, next))}
                onSaveAway={(memberId, next) => run(() => setMemberAway(memberId, next))}
                onSave={(member, patch) => saveMember(member, patch, { userId })}
                onRemove={(memberId) => run(() => removeHouseholdMember(memberId))}
                onDetach={(memberId) => run(() => detachHouseholdMember(memberId))}
                onAddAllergy={(m, l) => run(() => addAllergy(m, l))}
                onRemoveAllergy={(id) => run(() => removeAllergy(id))}
                onAddRestriction={(m, l) => run(() => addRestriction(m, l))}
                onRemoveRestriction={(id) => run(() => removeRestriction(id))}
              />

              {/* ── FF-043 · QUI GOUVERNE LA DOCTRINE DU TRONC ──────────────
                  APRÈS la liste des bouches, parce que la question ne se pose
                  qu'une fois qu'on sait qui est à table — et la carte se tait
                  d'elle-même en dessous de deux adultes, ce qui est le cas
                  nominal du produit (un parent, ses enfants). */}
              {/* ── TROIS CARTES SONT PARTIES SUR `/app/plan` (2026-08-13) ──
                  `ReferenceMemberCard`, `EnvyCard` et `ComposeCard`.

                  La règle de partage: cette page décrit LES GENS — qui mange
                  ici, leurs corps, leurs interdits, les invitations, les
                  propositions de fusion. `/app/plan` fabrique LA SEMAINE. Les
                  trois cartes fabriquaient la semaine depuis la page des gens.

                  `ComposeCard` ne déménage pas, elle DISPARAÎT: elle demandait
                  le BUDGET SEUL et codait la fenêtre en dur (« d'ici
                  dimanche »), alors que le formulaire de `/app/plan` pose les
                  deux dates, les jours de cuisine, la durée de session, le
                  budget ET la présence par bouche. Garder les deux aurait fait
                  deux formulaires pour un geste, dont le plus pauvre était
                  celui réservé au maître. */}
              {/* ── L8/D10 — CE QU'ON PROPOSE AU MAÎTRE ────────────────────
                  APRÈS la composition et AVANT la table: une proposition de
                  fusion se lit une fois qu'on sait qu'un plan existe, et elle
                  explique la table qui vient juste en dessous. La carte se
                  tait d'elle-même pour un secondaire (le serveur refuse 403,
                  et D10 met le geste dans les mains du maître).

                  ⚠️ ET ELLE SE TAIT AUSSI QUAND PERSONNE N'A RÉCLAMÉ SON
                  PROFIL. `mergeCounterparts` est lu ICI et pas dans la carte:
                  le roster est déjà chargé par cette page, et une carte qui
                  irait le relire ferait une seconde lecture du même fait. */}
              <HouseholdMergeCard
                isOwner={isOwner}
                hasCounterpart={mergeCounterparts(household).length > 0}
                onComposed={refresh}
              />
              {/* « À table » est parti sur `/app/plan`, sous le plan: il dit
                  comment on SERT ce que le plan dit qu'on CUISINE, et cet
                  écran-ci ne montre pas le plan. */}
              {/* ── L8/D9 — CE QUE LA MAISON CUISINE, ET CE QUI N'A PAS
                  FUSIONNÉ. Pour un secondaire c'est le seul endroit où le plan
                  du foyer se voit; pour tout le monde, c'est là que la
                  divergence est attribuée à la divergence. */}
              {meal
                ? (
                  <HouseholdPlanCard
                    meal={meal}
                    members={household.members}
                    meMemberId={me?.memberId ?? null}
                    isOwner={isOwner}
                  />
                )
                : null}
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
      <p className="mb-3 text-sm text-ink-soft">{t("household.empty.body")}</p>
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
            <p className="text-sm text-ink">
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
      <p className="mb-3 text-sm text-ink-soft">
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
        {/* ── LA SEULE ACTION FIGUE DE L'ÉCRAN, ET ELLE EST CONDITIONNELLE ────
            Mesuré au navigateur avant ce lot: `/app/household` rendait DEUX
            boutons `bg-fig-700` en même temps — celui-ci et « ajouter une
            bouche » — plus le lien de navigation actif du shell. Trois aplats de
            marque sur un écran, c'est-à-dire aucune hiérarchie.
            La promotion suit maintenant le MÊME fait que le ton de la carte:
            tant que la ligne d'objectif du compte maître n'existe pas, ce
            bouton est le seul geste qui débloque la composition, et la carte est
            déjà en `tone="warning"` pour le dire. Une fois la ligne écrite, ce
            même bouton n'est plus qu'une correction de prénom — et l'action
            principale de l'écran devient « composer », plus bas. */}
        <Button
          variant={needsGoalRow ? "primary" : "secondary"}
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
          <span className="text-sm text-ink-soft">{t("household.member.saved")}</span>
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
      <p className="mb-3 text-sm text-ink-soft">{t("household.add.body")}</p>
      {full ? (
        // LE PLAFOND ATTEINT EST UN FAIT, donc l'ambre reste (charte §2:
        // ambre = attention). Ce qui change: le rayon passe au vocabulaire, et
        // l'encre à `amber-800`, la valeur que `Badge tone="caution"` emploie —
        // un état se reconnaît d'un écran à l'autre à sa VALEUR, pas seulement
        // à sa famille.
        <p className="rounded-card bg-amber-50 p-3 text-sm text-amber-800">
          {t("household.add.full")}
        </p>
      ) : (
        <div ref={nameRef}>
          <MouthFields draft={draft} onChange={setDraft} />
          {/* ⛔ PLUS DE FIGUE ICI. Ce bouton et le « enregistrer » de la fiche du
              maître se rendaient TOUJOURS ensemble (vérifié au navigateur), donc
              l'écran montrait deux actions principales. Celle-ci perd la teinte:
              la carte est déjà annoncée par son sur-titre, et le geste se répète
              — on ajoute trois personnes d'affilée sans quitter le flux, ce que
              la carte est faite pour permettre. Un aplat de marque qu'on
              actionne cinq fois de suite n'est plus une action principale. */}
          <Button
            className="mt-3"
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
  { household, restrictions, allergies, busy, mutedMembers, rhythm, awayWindow, bodies, habits, onSaveHabits, onSaveDiet, onSaveBody, onMute, onSaveAway, onSave, onRemove, onDetach, onAddAllergy, onRemoveAllergy, onAddRestriction, onRemoveRestriction }: {
    household: HouseholdView;
    restrictions: RestrictionView[];
    allergies: AllergyView[];
    busy: boolean;
    /**
     * CE QUE CHAQUE BOUCHE MANGE D'HABITUDE. `null` = PAS ENCORE LU — et la
     * carte n'affiche alors aucun champ. Voir l'état de la page.
     */
    habits: Map<string, MemberHabitsView> | null;
    onSaveHabits: (
      memberId: string,
      slots: HabitSlot[],
      note: string | null,
    ) => Promise<boolean>;
    /** Le régime d'une bouche. `null` efface — « on n'a pas demandé ». */
    onSaveDiet: (memberId: string, diet: string | null) => Promise<boolean>;
    /**
     * Les corps saisis, par `member_id`. VIDE pour un non-maître, et pas parce
     * que l'écran le décide: `keel_household_member_bodies` lui rend zéro
     * ligne. La table n'a aucun grant à `authenticated`.
     */
    bodies: Map<string, MemberBodyView>;
    onSaveBody: (
      memberId: string,
      heightCm: number,
      weightKg: number,
      gender: MemberGender,
    ) => Promise<boolean>;
    /** D17 — les bouches dont on ne veut plus voir les propositions. */
    mutedMembers: Set<string> | null;
    /** Les LIGNES de la grille de présence — les moments d'une journée. */
    rhythm: EatingOccasionSlot[];
    /** Les COLONNES: la fenêtre que la composition va couvrir. */
    awayWindow: { tokens: string[]; dates: string[] };
    onMute: (memberId: string, muted: boolean) => void;
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
      </Card>
    );
  }

  return (
    <Card>
      <SectionLabel>{t("household.members.title")}</SectionLabel>
      <ul className="flex flex-col divide-y divide-line">
        {household.members.map((m) => (
          <MemberRow
            key={m.memberId}
            member={m}
            isMe={m.memberId === me?.memberId}
            allergies={allergies.filter((a) => a.memberId === m.memberId)}
            restrictions={restrictions.filter((r) => r.memberId === m.memberId)}
            busy={busy}
            // D17 — `null` tant que le réglage n'est pas lu, et `null` aussi
            // quand la lecture a échoué: on ne montre pas un interrupteur dont
            // on ignore la position.
            muted={mutedMembers === null ? null : mutedMembers.has(m.memberId)}
            rhythm={rhythm}
            awayWindow={awayWindow}
            // `null` = rien de saisi POUR CETTE BOUCHE. La carte des corps est
            // vide pour un non-maître (la RPC lui rend zéro ligne), donc ce
            // bloc ne s'affiche que là où il est légitime.
            body={bodies.get(m.memberId) ?? null}
            // DEUX `null` QUI NE VEULENT PAS DIRE LA MÊME CHOSE, et c'est le
            // piège du lot. `habitsLoaded` faux = LA LECTURE N'A PAS EU LIEU.
            // `habits` nul avec `habitsLoaded` vrai = LA LECTURE A EU LIEU et
            // personne n'a rien dit de cette bouche. Le second est une
            // réponse; le premier n'en est pas une, et rien ne doit s'afficher
            // dessus.
            habitsLoaded={habits !== null}
            habits={habits?.get(m.memberId) ?? null}
            onSaveHabits={(s, n) => onSaveHabits(m.memberId, s, n)}
            onSaveDiet={(diet) => onSaveDiet(m.memberId, diet)}
            onSaveBody={(h, w, g) => onSaveBody(m.memberId, h, w, g)}
            onMute={(next) => onMute(m.memberId, next)}
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


/**
 * LE CORPS D'UNE BOUCHE — taille, poids, sexe. TOUT-OU-RIEN.
 *
 * Décision humaine du 2026-08-12, qui renverse FF-047 §3 et le « cran 2 » du
 * README du foyer: on collecte pour CHAQUE bouche, y compris sans compte, y
 * compris pour un mineur.
 *
 * ⚠️ CE QUE CE FORMULAIRE NE FAIT PAS, ET NE FERA PAS. Il ne rend aucun
 * chiffre calculé — ni besoin, ni IMC, ni catégorie, ni cible. Ce qu'on saisit
 * entre dans le MOTEUR et en ressort en grammes d'aliment sur une assiette.
 * C'est la ligne de partage du lot: collecter et calculer, jamais énoncer.
 */
function BodyFields(
  { body, busy, needsBirthDate, onSave }: {
    body: MemberBodyView | null;
    busy: boolean;
    /** L'équation dépend de l'âge, et elle n'est pas la même avant 18 ans. */
    needsBirthDate: boolean;
    onSave: (h: number, w: number, g: MemberGender) => Promise<boolean>;
  },
) {
  const [height, setHeight] = React.useState(body ? String(body.heightCm) : "");
  const [weight, setWeight] = React.useState(body ? String(body.weightKg) : "");
  const [gender, setGender] = React.useState<MemberGender | "">(body?.gender ?? "");
  const [saved, setSaved] = React.useState(false);

  const h = Number(height);
  const w = Number(weight);
  // LE MÊME TOUT-OU-RIEN QU'EN BASE. Le bouton reste inerte tant que les trois
  // ne sont pas là: `body_incomplete` existe quand même côté serveur, parce
  // qu'un bouton grisé n'est pas une garde.
  const complete = Number.isFinite(h) && h > 0 && Number.isFinite(w) && w > 0 &&
    gender !== "";

  return (
    <div className="border-t border-line pt-3">
      <SectionLabel>{t("household.body.title")}</SectionLabel>
      <p className="mb-2 text-xs text-ink-soft">{t("household.body.hint")}</p>
      {body === null ? (
        <p className="mb-2 text-xs text-amber-800">{t("household.body.missing")}</p>
      ) : null}
      {needsBirthDate ? (
        <p className="mb-2 text-xs text-amber-800">
          {t("household.body.needs_birth_date")}
        </p>
      ) : null}
      {/* ── LES TROIS CHAMPS PASSENT PAR `Field`, ET CE N'EST PAS COSMÉTIQUE ──
          Ils se tenaient à la main: un `<label class="flex flex-col text-xs">`
          enveloppant un `<input class="rounded border-gray-300 text-sm">`. Trois
          conséquences mesurables, pas une:
            · `text-sm` = 14 px, donc Safari iOS zoomait au focus et ne
              dézoomait plus — la règle des 16 px d'`index.css` est dans
              `@layer base` et un utilitaire la bat;
            · `border-gray-300` est à 1,73:1 sur ce papier, sous le seuil de
              3:1 que WCAG 1.4.11 exige d'une bordure de CONTRÔLE;
            · l'étiquette n'était liée au champ que par l'enveloppe, et son
              cran (`text-xs`) n'était celui d'aucune autre étiquette du produit.
          La largeur vit maintenant sur l'ENVELOPPE (`w-24`), parce que
          `inputClass` porte `w-full`: la poser sur le champ ferait deux
          utilitaires `w-*` dont l'ordre de génération, et non la source,
          désignerait le gagnant. */}
      {/* `items-start` ET PAS `items-end`: un `<select>` fait 41 px là où un
          `<input>` en fait 42 (mesuré), donc aligner par le BAS décalait le haut
          des trois boîtes de 2 px et l'étiquette « sexe » d'autant. Aligné par
          le haut, ce sont les étiquettes et les bords supérieurs qui tombent
          juste — la ligne que l'œil suit. */}
      <div className="flex flex-wrap items-start gap-2">
        {/* ⚠️ `w-20` ET PAS `w-24`, ET C'EST UNE MESURE. À 320 px la fiche
            ouverte ne laisse que 198 px sur cette ligne (carte `p-4` + panneau
            `p-3`): deux champs de 96 px et leur gouttière de 8 en font 200, donc
            « taille » et « poids » se retrouvaient empilés pour 2 px. 80 + 80 + 8
            = 168, et 80 px tiennent « 180 » à 16 px. */}
        <Field label={t("household.body.height")} className="w-20">
          <input
            type="number"
            inputMode="decimal"
            className={inputClass}
            value={height}
            onChange={(e) => { setHeight(e.target.value); setSaved(false); }}
          />
        </Field>
        <Field label={t("household.body.weight")} className="w-20">
          <input
            type="number"
            inputMode="decimal"
            className={inputClass}
            value={weight}
            onChange={(e) => { setWeight(e.target.value); setSaved(false); }}
          />
        </Field>
        <Field label={t("household.body.gender")} className="w-40">
          <select
            className={inputClass}
            value={gender}
            onChange={(e) => {
              setGender(e.target.value as MemberGender | "");
              setSaved(false);
            }}
          >
            <option value="">—</option>
            {MEMBER_GENDERS.map((g) => (
              <option key={g} value={g}>{t(`household.body.gender_${g}` as never)}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="secondary"
          disabled={busy || !complete}
          onClick={async () => {
            // `complete` porte déjà `gender !== ""`, et TypeScript le sait: le
            // rétrécissement voyage par la constante. Rajouter le test ici
            // ferait une comparaison que le compilateur signale comme morte.
            if (!complete) return;
            const ok = await onSave(h, w, gender);
            if (ok) setSaved(true);
          }}
        >
          {t("household.body.save")}
        </Button>
        {saved ? (
          <span className="text-xs text-emerald-700">{t("household.body.saved")}</span>
        ) : null}
      </div>
    </div>
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
  { member, isMe, allergies, restrictions, busy, muted, rhythm, awayWindow, body, habits, habitsLoaded, onSaveHabits, onSaveDiet, onSaveBody, onMute, onSaveAway, onSave, onRemove, onDetach, onAddAllergy, onRemoveAllergy, onAddRestriction, onRemoveRestriction }: {
    member: HouseholdMemberView;
    isMe: boolean;
    allergies: AllergyView[];
    restrictions: RestrictionView[];
    busy: boolean;
    /** `null` = rien de saisi. Voir `BodyFields`: la bouche a une part standard. */
    body: MemberBodyView | null;
    /** `null` = LA LECTURE A EU LIEU et personne n'a rien dit de cette bouche. */
    habits: MemberHabitsView | null;
    /** Faux = la lecture n'a PAS eu lieu. Les deux `null` sont distincts. */
    habitsLoaded: boolean;
    onSaveHabits: (slots: HabitSlot[], note: string | null) => Promise<boolean>;
    /** Le régime de CETTE bouche. `null` efface. */
    onSaveDiet: (diet: string | null) => Promise<boolean>;
    onSaveBody: (h: number, w: number, g: MemberGender) => Promise<boolean>;
    /** D17 — `null` = le réglage n'a pas pu être lu. Voir l'interrupteur. */
    muted: boolean | null;
    rhythm: EatingOccasionSlot[];
    awayWindow: { tokens: string[]; dates: string[] };
    onMute: (muted: boolean) => void;
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

  /**
   * LES MOMENTS DE CETTE PERSONNE — les LIGNES de la carte des habitudes.
   *
   * ⚠️ LES SIENS, PAS UNE LISTE DE SIX (spec §H1). Quelqu'un qui ne prend pas
   * de collation ne doit pas lire une ligne vide toutes les semaines.
   *
   * `member.eatingSlots` est DÉJÀ tranché par le roster entre son « about you »
   * (si elle a un compte) et sa ligne (sinon) — cet écran ne refait pas la
   * résolution. `null` n'est pas une absence de donnée: il veut dire « aux
   * moments de la maison », et le repli est donc le rythme du foyer, celui-là
   * même avec lequel la composition tourne.
   */
  const habitSlots = React.useMemo<EatingOccasion[]>(() => {
    const raw = member.eatingSlots ?? rhythm.map((r) => r.slot);
    // Le vocabulaire fermé du moteur, et l'ordre de LA JOURNÉE. Un jeton
    // inconnu s'écarte plutôt que de fabriquer une ligne qu'on ne saurait pas
    // nommer à l'écran.
    const asked = new Set(raw);
    return EATING_OCCASIONS.filter((s) => asked.has(s));
  }, [member.eatingSlots, rhythm]);

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
        {/* ── DEUX PASTILLES MAISON PASSENT AU KIT, ET LEURS TONS SONT DES FAITS
            ─────────────────────────────────────────────────────────────────────
            Elles se dessinaient à la main (`rounded bg-…-50 px-2 py-0.5`), avec
            un rayon qui n'était ni celui d'une carte ni celui d'une pastille.
            Le TON n'est pas un choix de couleur, il nomme ce que la ligne fait
            au repas:
              · une ALLERGIE rejoint l'union de sécurité du générateur et
                gouverne toute la casserole — rien ne se compose si on ne peut
                pas la lire. C'est un refus: `critical`.
              · une RÈGLE DE MAISON est une décision domestique. Elle n'est
                l'état de rien dans le système, et la faire ressembler à un
                verdict de santé est précisément le mensonge que §8.5 interdit.
                Donc `neutral` — une étiquette, et c'est tout. */}
        {allergies.map((a) => (
          <Badge key={a.id} tone="critical">{a.label}</Badge>
        ))}
        {restrictions.map((r) => (
          <Badge key={r.id} tone="neutral">{r.label}</Badge>
        ))}
        {/* OUVRIR LA FICHE EST L'ACTION DE LA LIGNE, donc elle porte la teinte
            de marque (charte §2: la figue marque la navigation et l'action).
            Elle reste un texte souligné et non un bouton plein: huit lignes,
            huit boutons pleins, ce serait huit actions principales. */}
        <button
          className="ml-auto text-fig-700 underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t("household.member.close") : t("household.member.edit")}
        </button>
      </div>

      {open ? (
        // `bg-paper-2` ET PAS `bg-paper`: c'est un panneau EN CREUX dans une
        // carte, et `paper` est le fond de cette carte — la fiche ouverte
        // aurait disparu. `paper-2` est le jeton du « fond de section
        // alterné », et son couple avec `ink` reste à 15,02:1.
        <div className="mt-3 flex flex-col gap-3 rounded-card bg-paper-2 p-3">
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

          {/* ── LE CORPS DE CETTE BOUCHE (2026-08-12) ──────────────────────
              Y COMPRIS POUR UN MINEUR, ET C'EST LE RENVERSEMENT. Avant ce lot,
              un enfant n'avait ni corps ni enveloppe ni add-on: il mangeait le
              tronc commun, c'est-à-dire — dans un foyer où un adulte est en
              déficit — LE DÉFICIT DE CET ADULTE, sans rien en plus.

              Ce que le formulaire collecte ne ressort JAMAIS: pas au prompt
              pour un mineur, pas dans une consigne de service, pas dans un log
              nominatif. Il entre dans le moteur et en ressort en grammes. */}
          <BodyFields
            body={body}
            busy={busy}
            // L'ÉQUATION DÉPEND DE L'ÂGE, et celle d'un enfant n'est pas celle
            // d'un adulte. Sans date, aucune des deux ne s'applique: la bouche
            // garde une part standard, jamais réduite.
            needsBirthDate={member.ageState === "unknown"}
            onSave={onSaveBody}
          />

          {/* ── COMMENT CETTE BOUCHE MANGE (2026-08-14) ────────────────────
              LA QUESTION EXISTAIT POUR LE TITULAIRE ET POUR PERSONNE D'AUTRE,
              et l'utilisateur l'a redemandée deux fois. Les trois jetons
              vivaient sur `student_safety_constraints`, clée sur `user_id`:
              une bouche sans compte n'avait nulle part où porter un régime, et
              un enfant végétarien était INDÉCLARABLE.

              ⚠️ AVANT LES HABITUDES, ET L'ORDRE PORTE DU SENS: ceci dit ce
              qu'elle ne mange JAMAIS, la carte du dessous dit ce qu'elle mange
              À LA PLACE du plat commun. Dans l'autre sens, l'habitude se lirait
              comme une exception à une règle pas encore énoncée.

              ⚠️ RIEN N'EST PRÉ-ALLUMÉ, et re-cliquer efface. `null` veut dire
              « on n'a pas demandé »; `omnivore` veut dire « on a demandé, elle
              mange de tout ». Allumer `omnivore` par défaut écrirait à l'écran
              une réponse que personne n'a donnée.

              ⚠️ UNE BOUCHE AVEC COMPTE N'EST PAS ÉDITABLE ICI — la base refuse
              (`has_account`) et le roster ne lirait pas la colonne. L'écran le
              DIT plutôt que de masquer la ligne, exactement comme l'objectif
              depuis D1: « il n'y a rien ici » et « ça se règle ailleurs » ne
              sont pas la même phrase. */}
          <div className="border-t border-line pt-3">
            <Field
              label={t("household.member.diet")}
              hint={t("household.member.diet_hint")}
            >
              {member.userId === null
                ? (
                  <div className="flex flex-wrap gap-2">
                    {DIET_ANSWERS.map((d) => (
                      <Button
                        key={d}
                        size="sm"
                        variant={member.diet === d ? "primary" : "secondary"}
                        disabled={busy}
                        onClick={() => {
                          void onSaveDiet(member.diet === d ? null : d);
                        }}
                      >
                        {/* ⚠️ LES LIBELLÉS SONT DANS LE NAMESPACE DE CETTE
                            PAGE, pas dans `setup.*`. La LISTE est partagée
                            (`DIET_ANSWERS`, importée) — c'est elle qui est
                            load-bearing; les mots, eux, ne traversent pas la
                            couture: `pageSeams.int.test.ts` refuse qu'une page
                            atteigne le namespace d'une autre, et il a raison —
                            la couverture de locale se mesure par namespace. */}
                        {t(
                          `household.member.diet_${d}` as
                            "household.member.diet_omnivore",
                        )}
                      </Button>
                    ))}
                  </div>
                )
                : (
                  <p className="text-xs text-ink-soft">
                    {t("household.member.diet_from_profile")}
                  </p>
                )}
            </Field>
          </div>

          {/* ── CE QUE CETTE BOUCHE MANGE D'HABITUDE (2026-08-14) ──────────
              L'ENDROIT QUI MANQUAIT. Une bouche sans compte n'avait nulle part
              où dire ce qu'elle mange: `food_preferences` est clé sur
              `user_id`. On savait d'elle prénom, naissance, objectif, absences,
              moments, allergies et corps — et rien sur ce qu'elle mange. Un
              plan réel a donc servi des œufs brouillés sept matins d'affilée à
              une femme qui mange une pomme.

              ⚠️ RIEN N'EST PRÉ-COCHÉ, ET AUCUNE ABSENCE N'EST COMPTÉE. Les deux
              règles vivent dans la carte et dans `habitDraft`; elles sont la
              raison d'être du lot, pas une finition. */}
          <HouseholdHabitsCard
            slots={habitSlots}
            habits={habits}
            loaded={habitsLoaded}
            busy={busy}
            onSave={onSaveHabits}
          />

          {/* ── D14 · QUAND CETTE BOUCHE N'EST PAS LÀ ──────────────────────
              LA GRILLE EST CELLE DU CONSTRUCTEUR, pas une seconde. Deux
              grilles pour la même question divergeraient sur le seul détail
              qui compte — ce que « tout décoché » veut dire — et c'est celle
              qu'on regarde le moins qui garderait l'ancienne règle.

              CE QU'ELLE MONTRE ET ÉCRIT EST LA MARQUE DU MAÎTRE, JAMAIS
              L'UNION. La grille réécrit ce qu'on lui donne: nourrie de
              l'union, elle recopierait la déclaration de la personne dans la
              colonne du foyer, où elle survivrait à sa rétractation. */}
          <div className="border-t border-line pt-3">
            <SectionLabel>{t("household.away.title")}</SectionLabel>
            <p className="mb-2 text-xs text-ink-soft">
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
              <p className="mt-2 text-xs text-ink-soft">
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
            <p className="text-xs text-ink-soft">
              {member.userId
                ? t("household.member.detach_hint")
                : t("household.member.remove_hint")}
            </p>
          ) : null}

          {/* ── D17 · LE RÉGLAGE DISCRET (L8) ────────────────────────────────
              « Un réglage discret permet au maître de ne plus se voir proposer
              la fusion pour une personne donnée. Assumé comme un peu brutal,
              donc caché. » Il est donc ICI, rangé dans la fiche de la
              personne, et JAMAIS sur la carte de proposition: un bouton
              « ne plus me parler de lui » à côté de « fusionner » ferait du
              geste brutal le geste le plus facile.

              ⚠️ IL NE BLOQUE PAS LA FUSION, et la phrase d'aide le dit: le
              geste reste possible (`operation: "merge"` ne lit pas ce réglage,
              un test de source le tient), et il ne coupe pas l'avertissement
              de D8, qui parle du plan du MAÎTRE.

              RÉSERVÉ AUX BOUCHES QUI ONT UN COMPTE: une bouche sans compte n'a
              pas de plan à elle (D3), donc rien à proposer, donc rien à taire.
              `muted === null` ⇒ on n'a pas pu lire le réglage: on ne montre
              pas un interrupteur dont on ignore la position. */}
          {member.role !== "owner" && member.userId && muted !== null ? (
            <button
              type="button"
              className="self-start text-xs text-ink-soft underline disabled:opacity-50"
              disabled={busy}
              onClick={() => onMute(!muted)}
            >
              {muted ? t("household.merge.unmute") : t("household.merge.mute")}
            </button>
          ) : null}
          {member.role !== "owner" && member.userId && muted !== null ? (
            <p className="text-xs text-ink-soft">
              {muted ? t("household.merge.muted") : t("household.merge.mute_hint")}
            </p>
          ) : null}

          <div className="border-t border-line pt-3">
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
                  <span className="font-medium text-red-700">{a.label}</span>
                  <span className="text-ink-soft">
                    {t("household.constraint.kind.allergy")}
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
              {restrictions.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-ink-soft">
                    {t("household.constraint.kind.house_rule")}
                  </span>
                  <button
                    className="text-ink-soft underline"
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
      <p className="mb-3 text-sm text-ink-soft">{t("household.invite.body")}</p>
      {/* CE QUE LA RÉCLAMATION DONNE, DIT AU MAÎTRE AVANT QU'IL PROMETTE. Il
          est celui qui écrit le message d'accompagnement: s'il annonce « tu
          pourras composer », la base le démentira et c'est lui qui aura menti. */}
      <p className="mb-3 text-sm text-ink-soft">{t("household.invite.grants")}</p>
      {claimable.length === 0 ? (
        <p className="rounded-card bg-paper-2 p-3 text-sm text-ink-soft">
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
              {/* ⚠️ `sm:flex-1` ET PAS `flex-1`. Mesuré à 1280: le champ
                  d'adresse tenait 192 px pendant que la carte en offrait 606 —
                  une adresse de courrier n'y tient pas, et il restait 400 px de
                  vide à côté. Mais la grandeur ne vaut QU'EN LIGNE: dans le
                  `flex-col` de moins de 640 px, `flex-1` s'appliquerait à la
                  HAUTEUR. Et `min-w-0` va avec, sans quoi l'enfant refuse de
                  descendre sous son contenu (`min-width:auto`) et fait défiler
                  la page à 320. */}
              <Field label={t("household.invite.email")} className="min-w-0 sm:flex-1">
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
          <p className="mb-1 text-ink-soft">
            {t("household.invite.link_ready", { name: invite.firstName })}
          </p>
          <code className="block overflow-x-auto rounded-card bg-paper-2 p-2 text-xs">
            {`${globalThis.location?.origin ?? ""}/join-household?token=${invite.token}`}
          </code>
        </div>
      ) : null}
      {/* LISTE FERMÉE, et le typecheck l'exige: `t()` n'accepte pas une clé
          construite à la volée. C'est la bonne contrainte — un motif que la
          RPC ajouterait sans étiquette d'affichage casserait la compilation
          plutôt que d'afficher une clé brute à l'utilisateur. */}
      {reason ? (
        // UN REFUS EST UN ÉTAT, ET IL LE DIT MAINTENANT. Cette ligne sortait en
        // gris, donc elle se lisait comme une précision alors qu'elle annonce
        // que l'invitation n'est PAS partie. C'est la même nature de message que
        // l'échec de composition, qui était déjà en `red-700`: deux couleurs
        // pour un seul état, dans un seul fichier.
        <p className="mt-2 text-sm text-red-700">{inviteErrorText(reason)}</p>
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
    // ── L'AMBRE EST L'ÉTAT, PAS LA DÉCORATION DE LA CARTE ────────────────────
    // « En pause » EST un état, et il reste: il est porté par la SURFACE de la
    // carte (`tone="warning"` = `border-amber-200 bg-amber-50`, le bandeau
    // d'état de l'arbitrage §5.2). Ce qui part, c'est l'ambre répandu sur
    // chacune des quatre phrases et sur le bouton — sept classes saturées qui ne
    // portaient aucun fait de plus que la surface sous elles, et qui rendaient
    // le seul vrai message d'échec de la carte indiscernable du reste.
    // Le texte passe à `ink` (16,46:1 sur `amber-50`, mesuré au calcul WCAG),
    // et l'échec de paiement au rouge — c'est un état, et c'est le même rouge
    // que l'échec de composition dix lignes plus bas.
    <Card tone="warning">
      <SectionLabel>{t("household.paused.title")}</SectionLabel>
      <p className="text-sm text-ink">{t("household.paused.body")}</p>
      <p className="mt-2 text-sm text-ink">{t("household.paused.kept")}</p>
      {isOwner
        ? (
          <>
            {/* ⚠️ PAS DE VARIANTE MAISON ICI. Ce bouton se reteignait à la main
                (`border-amber-300 text-amber-900 hover:bg-amber-100`) — une
                sixième variante de bouton, née de l'idée qu'un bouton posé sur
                de l'ambre doit être ambre. Le `secondary` du kit
                (`border-line-strong bg-paper text-ink`) se détache MIEUX sur
                cette surface, et c'est le même bouton que partout ailleurs. */}
            <Button
              className="mt-3"
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
              ? <p className="mt-2 text-sm text-red-700">{failure}</p>
              : null}
          </>
        )
        : (
          <p className="mt-2 text-sm text-ink">
            {t("household.paused.owner_only")}
          </p>
        )}
    </Card>
  );
}


