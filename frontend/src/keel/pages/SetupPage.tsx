import React from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { allergenLabel, ALLERGEN_OPTIONS } from "../copy/allergens";
import { edgeRefusalKey } from "../copy/planRefusals";
import { setupMissKey } from "../copy/setupMisses";
import { LocaleSwitch } from "../components/LocaleSwitch";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";
import {
  addHouseholdMember,
  createHousehold,
  generateHouseholdMeal,
  inviteToHousehold,
  MEMBER_GENDERS,
  type MemberGender,
  goalsForAge,
  MEMBER_GOALS,
  type MemberGoal,
  removeHouseholdMember,
  setMemberBirthDate,
  setMemberGoal,
  setOwnBirthDate,
} from "../api/household";
import { generateMeal } from "../api/mealGeneration";
import { DAY_TOKENS, EATING_OCCASIONS } from "../api/mealGeneration";
import {
  BIRTH_DATE_ON_FILE,
  birthDateAnswer,
  branchForMouths,
  canGenerate,
  COOKING_SESSION_MINUTES,
  DIET_ANSWERS,
  type DietAnswer,
  cookingTimeParts,
  DEFAULT_HOUSEHOLD_NAME,
  type FunnelBranch,
  type FunnelFacts,
  type FunnelMissId,
  type FunnelMouth,
  type FunnelPlanAnswers,
  type FunnelState,
  funnelSteps,
  HOUSEHOLD_MAX_MOUTHS,
  missesForStep,
  nextIncomplete,
  readFunnelFacts,
  nameAlreadyEating,
  saveMouthAllergies,
  saveMouthBody,
  saveOwnAllergies,
  saveOwnDiet,
  saveOwnGoal,
  saveOwnProfile,
  saveOwnWeight,
  savePlanAnswers,
} from "../api/onboarding";
import { BUDGET_MAX } from "../api/planBudget";
import { browserLocalDate } from "../lib/useMealTicks";
import { t, type MessageKey } from "../i18n/t";

// KEEL — FF-060, L'ENTONNOIR D'ENTRÉE.
//
// Fiche: docs/fonctionnalites/acquisition-et-acces/FF-060-le-parcours-d-entree.md
//
// ── CE QUE CET ÉCRAN REMPLACE ──────────────────────────────────────────────
// Un compte neuf atterrissait sur `/app/today` — vide — et tout son réglage
// vivait derrière un bouton « Set up » d'une fenêtre de `/app/plan`, qui
// empilait quatre sections dans un ordre que personne ne pouvait deviner. Il
// n'existait AUCUN chemin qui mène de « je viens de créer mon compte » à « voici
// mon premier plan ».
//
// ── TROIS RÈGLES QUI GOUVERNENT TOUT CE FICHIER ────────────────────────────
//
// 1. `canGenerate` EST LA SEULE SOURCE qui active le bouton de fin. Cet écran
//    ne refait jamais le calcul « à peu près »: deux vérités divergentes sur ce
//    qui manque, c'est un bouton actif qui rend une erreur.
//
// 2. RIEN N'EST RENDU AVANT D'AVOIR LU. Cicatrice du dépôt: un formulaire figé
//    au montage affiche du vide qu'il n'a pas encore lu, puis l'ÉCRASE au Save.
//    D'où la porte `state.kind === "loading"` — pas un spinner décoratif.
//
// 3. LA DERNIÈRE ACTION EST LA GÉNÉRATION. Pas de « merci », pas de « ton plan
//    arrive »: aucune copie de ce produit ne doit faire ATTENDRE quelqu'un, le
//    coach ne prépare rien pour personne (docs/keel/MODEL.md). Le bouton
//    compose, et l'écran suivant est le plan.

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

/**
 * UN REFUS DE GÉNÉRATEUR, DANS SES MOTS.
 *
 * ⚠️ LES DEUX APPELANTS ONT DÉJÀ LU LE CORPS, ET C'EST POURQUOI ON NE LE RELIT
 * PAS ICI. `supabase.functions.invoke` ne rend pas le corps d'une réponse
 * non-2xx (`error.message` vaut « Edge Function returned a non-2xx status
 * code »); `generateMeal` et `generateHouseholdMeal` vont donc chercher le
 * jeton eux-mêmes et lèvent `Error("<jeton>")` ou `Error("<jeton>: <détail>")`.
 * Ce qui arrive ici est déjà le jeton — il ne reste qu'à le traduire.
 *
 * Un jeton inconnu retombe sur le message brut, jamais sur une phrase
 * générique: un refus qu'on n'a pas prévu doit rester VISIBLE, sinon on le
 * découvre six mois plus tard dans un ticket.
 */
function refusalMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const key = edgeRefusalKey(raw.split(":")[0]?.trim() ?? "");
  return key ? t(key) : raw;
}

/** Le brouillon de MA fiche. Séparé des faits: on ne réécrit qu'au Save. */
interface SelfDraft {
  firstName: string;
  /** Vide = pas encore saisie. Le champ est une `date`, donc `YYYY-MM-DD`. */
  birthDate: string;
  heightCm: string;
  weightKg: string;
  gender: MemberGender | "";
  goal: MemberGoal | "";
  /** Vide = pas encore répondu. `omnivore` EST une réponse. */
  diet: DietAnswer | "";
  allergies: string[];
  /** « Rien à déclarer » — une RÉPONSE, pas une absence de réponse. */
  allergiesNone: boolean;
}

/** Le brouillon d'une bouche qu'on ajoute. */
interface MouthDraft {
  firstName: string;
  kind: "adult" | "child";
  birthDate: string;
  /** Tout-ou-rien, comme la base: les trois ou aucun. */
  heightCm: string;
  weightKg: string;
  gender: MemberGender | "";
  goal: MemberGoal | "";
  allergies: string[];
  allergiesNone: boolean;
}

function emptyMouthDraft(): MouthDraft {
  return {
    firstName: "",
    kind: "adult",
    birthDate: "",
    heightCm: "",
    weightKg: "",
    gender: "",
    goal: "",
    allergies: [],
    allergiesNone: false,
  };
}

// ── LES TROIS TABLES DE LIBELLÉS, ET CE QUI A CHANGÉ ───────────────────────
//
// Elles portaient les DIX-NEUF PHRASES elles-mêmes, en dur. Le compilateur les
// gardait complètes (`Record<MemberGoal, string>` réclame un mot par objectif),
// et c'est justement ce qui les rendait invisibles: elles avaient l'air d'être
// tenues. Mais un `const` de module est figé à la langue du bundle — `t()` ne
// peut pas y être appelé, la règle MODULE_SCOPE_T du lint le refuse et elle a
// raison —, donc dix-neuf mots anglais survivaient au milieu d'un formulaire
// français.
//
// Les tables gardent leur complétude et changent de contenu: elles portent des
// CLÉS, et la résolution se fait à l'appel, dans les trois accesseurs
// ci-dessous. Un objectif ajouté sans son mot ne compile toujours pas.
const GOAL_KEYS: Record<MemberGoal, MessageKey> = {
  fat_loss: "setup.goal.fat_loss",
  muscle_gain: "setup.goal.muscle_gain",
  recomposition: "setup.goal.recomposition",
  performance: "setup.goal.performance",
  health: "setup.goal.health",
  maintenance: "setup.goal.maintenance",
};

const OCCASION_KEYS: Record<string, MessageKey> = {
  breakfast: "setup.occasion.breakfast",
  snack_am: "setup.occasion.snack_am",
  lunch: "setup.occasion.lunch",
  snack_pm: "setup.occasion.snack_pm",
  dinner: "setup.occasion.dinner",
  before_bed: "setup.occasion.before_bed",
};

const DAY_KEYS: Record<string, MessageKey> = {
  mon: "setup.day.mon",
  tue: "setup.day.tue",
  wed: "setup.day.wed",
  thu: "setup.day.thu",
  fri: "setup.day.fri",
  sat: "setup.day.sat",
  sun: "setup.day.sun",
};

function goalLabel(goal: MemberGoal): string {
  return t(GOAL_KEYS[goal]);
}

/**
 * Les deux suivants gardent le repli sur le JETON BRUT qu'avait le `??` des
 * tables d'origine, et c'est délibéré: les créneaux et les jours viennent de
 * `api/mealGeneration.ts`, et un jeton neuf ajouté là-bas doit se voir à
 * l'écran plutôt que faire tomber le formulaire d'inscription de quelqu'un.
 * C'est la même posture que `allergenLabel` — jamais un écran vide pour un mot
 * manquant.
 */
function occasionLabel(slot: string): string {
  const key = OCCASION_KEYS[slot];
  return key ? t(key) : slot;
}

function dayLabel(day: string): string {
  const key = DAY_KEYS[day];
  return key ? t(key) : day;
}

export default function SetupPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [state, setState] = React.useState<Load>({ kind: "loading" });
  const [facts, setFacts] = React.useState<FunnelFacts | null>(null);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  /**
   * « ON A ESSAYÉ DE QUITTER CETTE ÉTAPE, ET ELLE A RETENU. »
   *
   * Un drapeau d'ÉCRAN, et volontairement pas un fait: la liste affichée est
   * toujours recalculée depuis les faits (elle rétrécit à mesure qu'on répond),
   * ce drapeau ne décide QUE du moment où on commence à la montrer. Sans lui,
   * un compte neuf arriverait à l'étape 2 avec la liste de tout ce qu'il n'a
   * pas encore rempli, juste sous le formulaire qui le demande.
   */
  const [heldBack, setHeldBack] = React.useState(false);
  /** La bouche dont le retrait attend un second clic. Voir `MouthRow`. */
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null);

  const [self, setSelf] = React.useState<SelfDraft | null>(null);
  const [plan, setPlan] = React.useState<FunnelPlanAnswers | null>(null);
  const [mouth, setMouth] = React.useState<MouthDraft>(emptyMouthDraft);
  const [invite, setInvite] = React.useState<
    { memberId: string; token: string; firstName: string } | null
  >(null);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteFor, setInviteFor] = React.useState<string | null>(null);

  /**
   * LA LECTURE, ET ELLE EST LA SEULE SOURCE DE L'ÉTAT.
   *
   * ⚠️ `seed` NE RESÈME LES BROUILLONS QU'AU PREMIER CHARGEMENT. Un `refresh`
   * après une écriture qui réécraserait les champs ferait perdre ce que la
   * personne est en train de taper dans la section d'à côté — le défaut exact
   * que la fenêtre de `/app/plan` a mis un chantier à refermer.
   */
  const load = React.useCallback(
    async (seed: boolean) => {
      if (!userId) return;
      try {
        const read = await readFunnelFacts(userId);
        setFacts(read);
        if (seed) {
          setSelf({
            firstName: read.state.self.firstName,
            // La date de MOI vient de `profiles`, donc elle est lisible telle
            // quelle — contrairement à celle d'une autre bouche, que le roster
            // ne rend jamais.
            birthDate: read.state.self.birthDate ?? "",
            heightCm: read.state.self.heightCm === null
              ? ""
              : String(read.state.self.heightCm),
            weightKg: read.state.self.weightKg === null
              ? ""
              : String(read.state.self.weightKg),
            gender: read.state.self.gender ?? "",
            diet: read.state.self.diet ?? "",
            goal: read.state.self.goal ?? "",
            allergies: [],
            allergiesNone: read.state.self.allergiesReviewed,
          });
          setPlan(read.state.plan);
          const branch = read.branch;
          const step = branch ? nextIncomplete(read.state, branch) : null;
          const steps = branch ? funnelSteps(branch) : [];
          setStepIndex(
            step ? Math.max(0, steps.findIndex((s) => s.id === step.id)) : Math.max(0, steps.length - 1),
          );
        }
        setState({ kind: "ready" });
      } catch (error) {
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [userId],
  );

  React.useEffect(() => {
    void load(true);
  }, [load]);

  // ── LA PORTE DE MONTAGE ──────────────────────────────────────────────────
  // Aucun formulaire avant la fin de la lecture. Voir la règle 2 de l'en-tête:
  // un écran qui affiche du vide non lu finit toujours par le faire écrire.
  if (state.kind === "loading" || !facts || !self || !plan) {
    return (
      <FunnelShell>
        <p className="text-sm text-ink-soft">{t("setup.loading")}</p>
      </FunnelShell>
    );
  }

  if (state.kind === "error") {
    return (
      <FunnelShell>
        <Card tone="warning">
          <p className="text-sm text-ink">{t("setup.error.title")}</p>
          <p className="mt-1 text-xs text-ink-soft">{state.message}</p>
        </Card>
      </FunnelShell>
    );
  }

  // ── L'ÉTAT COURANT ───────────────────────────────────────────────────────
  // La branche vient des FAITS, jamais d'un état d'écran: quelqu'un qui revient
  // trois jours plus tard doit retrouver la sienne, et un foyer en base est ce
  // qui la porte.
  const branch: FunnelBranch = facts.branch ?? "solo";
  const steps = funnelSteps(branch);
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  /**
   * L'ÉTAT SUR LEQUEL LE BOUTON DE FIN SE DÉCIDE.
   *
   * Les faits en base, PLUS le brouillon de l'étape 3 — qui sera écrit à la
   * milliseconde d'avant la génération, dans le même geste. Toutes les autres
   * réponses ont déjà été écrites par leur « Continue »: les prendre du
   * brouillon ferait s'allumer le bouton sur des champs remplis et jamais
   * enregistrés, ce qui est le mensonge que cet écran existe pour éviter.
   */
  const previewState: FunnelState = { ...facts.state, plan };
  const verdict = canGenerate(previewState, branch);
  const missing = verdict.ok ? [] : verdict.missing;

  /**
   * CE QUI MANQUE ENCORE À L'ÉTAPE OÙ ON EST — la même arithmétique, filtrée.
   *
   * Une étape ne se laisse pas quitter tant qu'elle en a: on ne peut pas
   * répondre à une question depuis l'écran d'après, et c'est exactement ce que
   * l'entonnoir demandait pour les bouches jusqu'au 2026-08-13.
   */
  const stepMissing = missesForStep(previewState, branch, step.id);

  const isLast = stepIndex >= steps.length - 1;

  async function guard(work: () => Promise<void>) {
    setBusy(true);
    setFailure(null);
    setFlash(null);
    try {
      await work();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  // ── ÉTAPE 1 ──────────────────────────────────────────────────────────────

  /**
   * ⚠️ LE SOLO NE CRÉE PAS DE FOYER, et le couple/famille en crée un TOUT DE
   * SUITE. C'est ce qui rend l'étape 1 dérivable à la reprise: un foyer en base
   * répond « au moins deux », et une ligne `student_goals` sans foyer répond
   * « juste moi ». Aucun drapeau de progression n'est écrit nulle part.
   */
  function chooseSize(mouths: number) {
    void guard(async () => {
      if (mouths >= 2 && !facts!.householdId) {
        const result = await createHousehold(DEFAULT_HOUSEHOLD_NAME);
        if (!result.ok) throw new Error(result.reason);
      }
      await load(false);
      // La branche décidée ici est LOCALE jusqu'à la relecture: on avance
      // d'une étape, et la relecture a déjà remis les faits d'accord.
      setStepIndex(1);
    });
  }

  // ── ÉTAPE 2 ──────────────────────────────────────────────────────────────

  function saveSelf(): Promise<void> {
    return (async () => {
      const draft = self!;
      const height = Number(draft.heightCm);
      const weight = Number(draft.weightKg);
      // L'ORDRE COMPTE. Le profil et la date d'abord (ils ne dépendent de
      // rien), l'objectif ensuite — il CRÉE la ligne `student_goals` —, et les
      // allergies en dernier, parce que leur accusé (« rien à déclarer ») se
      // fusionne dans `practical_constraints`, donc a besoin de cette ligne.
      if (draft.gender && Number.isFinite(height)) {
        await saveOwnProfile({
          userId,
          firstName: draft.firstName,
          heightCm: height,
          gender: draft.gender,
        });
      }
      // MON POIDS VA DANS LA SÉRIE — c'est elle qui arme `restriction_guard`.
      if (Number.isFinite(weight) && weight > 0) {
        await saveOwnWeight({ userId, weightKg: weight, localDate: browserLocalDate() });
      }
      // ── ET MA LIGNE DE CORPS, S'IL Y A UN FOYER ────────────────────────
      // `profiles` ne suffit pas: `keel_household_bodies_for` ne lit QUE
      // `household_member_bodies`, et le moteur saute une bouche sans corps.
      // Le maître est une bouche comme les autres — son profil ne la remplace
      // pas.
      if (
        facts!.householdId && facts!.ownMemberId && facts!.isOwner &&
        draft.gender && Number.isFinite(height) && Number.isFinite(weight)
      ) {
        await saveMouthBody({
          memberId: facts!.ownMemberId,
          heightCm: height,
          weightKg: weight,
          gender: draft.gender,
        });
      }
      if (draft.birthDate) {
        const answer = birthDateAnswer(draft.birthDate, browserLocalDate());
        if (!answer) throw new Error(t("setup.people.birth_date_error"));
        const written = await setOwnBirthDate(userId, answer.date);
        if (!written.ok) throw new Error(t("setup.people.birth_date_error"));
      }
      if (draft.goal) await saveOwnGoal(userId, draft.goal);
      // LE RÉGIME AVANT LES ALLERGIES, et APRÈS l'objectif: son accusé se
      // fusionne dans `practical_constraints`, donc il a besoin de la ligne
      // `student_goals` que `saveOwnGoal` vient de créer.
      if (draft.goal && draft.diet) {
        const fresh = await readFunnelFacts(userId);
        await saveOwnDiet({ userId, diet: draft.diet, current: fresh.practicalConstraints });
      }
      if (draft.goal && (draft.allergiesNone || draft.allergies.length > 0)) {
        const fresh = await readFunnelFacts(userId);
        await saveOwnAllergies({
          userId,
          labels: draft.allergies,
          current: fresh.practicalConstraints,
        });
      }
      await load(false);
    })();
  }

  /**
   * AJOUTER UNE BOUCHE — et c'est le geste que tout ce chantier existe pour
   * rendre rapide. En rafale, pas une modale par personne.
   *
   * ⚠️ L'ALLERGIE SEULE. Les trois natures sont distinctes (FF-046): allergie
   * (médicale → union de sécurité, fail-closed), règle de maison (parentale →
   * verrou qui tait le pourquoi), aversion (goût → préférence). L'entonnoir ne
   * collecte que la première, et son écran le dit.
   */
  function addMouth(): Promise<void> {
    return (async () => {
      const draft = mouth;
      const name = draft.firstName.trim();
      if (!name) throw new Error(t("setup.missing.member_first_name"));
      // ── LE DOUBLON EST REFUSÉ AVANT D'ÊTRE ÉCRIT ───────────────────────
      // Mesuré sur un compte réel le 2026-08-13: la même personne saisie trois
      // fois. Le plan nomme les parts par prénom — deux lignes identiques le
      // rendent illisible pour la seule personne qui doit le lire à table.
      if (nameAlreadyEating(name, facts!.mouths)) {
        throw new Error(t("setup.mouths.duplicate", { name }));
      }
      // ── LE MAÎTRE D'ABORD, ET C'EST UNE CONTRAINTE D'ÉCRITURE ──────────
      // L'accusé « on a demandé les allergies de cette bouche » se fusionne
      // dans `student_goals.practical_constraints` DU MAÎTRE, et cette ligne
      // n'existe qu'une fois sa direction posée.
      //
      // ⚠️ CETTE CONTRAINTE A LONGTEMPS ÉTÉ UNE RÈGLE DE MISE EN PAGE: le
      // formulaire d'ajout n'apparaissait qu'une fois l'objectif ENREGISTRÉ.
      // Or le bouton principal de l'étape 2 enregistre ET avance — donc sur le
      // chemin nominal (je remplis, je continue) la question des bouches
      // n'était JAMAIS montrée, et l'étape 3 la réclamait ensuite sans offrir
      // le champ. Mesuré au navigateur le 2026-08-13 sur un compte neuf.
      // L'ordre d'écriture se tient ici, où il est vrai; le formulaire, lui,
      // est visible dès qu'il y a un foyer.
      if (facts!.state.self.goal === null) {
        if (!self!.goal) throw new Error(t("setup.missing.own_goal"));
        await saveSelf();
      }
      let birth: string | null = null;
      if (draft.birthDate) {
        const answer = birthDateAnswer(draft.birthDate, browserLocalDate());
        if (!answer) throw new Error(t("setup.people.birth_date_error"));
        birth = answer.date;
      }
      const result = await addHouseholdMember(
        name,
        birth,
        // UN ENFANT PORTE SA DIRECTION DEPUIS LE 2026-08-13 — mais jamais
        // `fat_loss` ni `recomposition`, que `goalsFor` ne propose pas et que
        // la base refuse (`goal_not_for_minor`). Écran et base disent la même
        // chose: ne pas envoyer ce qui serait refusé, ne pas afficher comme
        // active une valeur que le moteur n'appliquerait pas.
        draft.goal || null,
      );
      if (!result.ok) throw new Error(result.reason);
      const memberId = String(result.member_id ?? "");
      // ── CE QUI SUIT EST RATTRAPÉ, ET LA LIGNE EST RETIRÉE SI ÇA CASSE ───
      // ⚠️ LE GESTE N'EST PAS ATOMIQUE, ET IL DOIT LE PARAÎTRE. La bouche est
      // créée par une RPC, son corps par une deuxième, son accusé d'allergie
      // par une troisième. Si l'une des deux dernières échoue, la ligne existe
      // DÉJÀ — incomplète, et le brouillon est encore rempli. L'utilisateur
      // voit une erreur, corrige, recommence: une deuxième ligne. C'est
      // exactement ce qu'on a mesuré sur un compte réel le 2026-08-13, à une
      // seconde d'intervalle.
      //
      // On rembobine donc jusqu'à l'état d'AVANT le geste. La suppression ne
      // peut rien détruire d'autre: cette bouche vient d'être créée à la ligne
      // du dessus, elle n'a ni compte, ni historique, ni rien que l'écran n'ait
      // envoyé lui-même.
      try {
        // LE CORPS, DANS LA FOULÉE ET DANS LA MÊME TRANSACTION LOGIQUE. Sans
        // lui, la bouche existe et le moteur l'ignore: elle mange la part de
        // tout le monde. Tout-ou-rien, comme la RPC.
        const mHeight = Number(draft.heightCm);
        const mWeight = Number(draft.weightKg);
        if (draft.gender && Number.isFinite(mHeight) && Number.isFinite(mWeight)) {
          await saveMouthBody({
            memberId,
            heightCm: mHeight,
            weightKg: mWeight,
            gender: draft.gender,
          });
        }
      // ⚠️ L'ACCUSÉ EST ÉCRIT MÊME QUAND LA LISTE EST VIDE. « Aucune » est une
      // réponse: sans elle, la reprise relit « jamais demandé » et l'entonnoir
      // se bloque sur une question à laquelle la ligne n'offre pas de champ.
      //
      // ET IL PART D'UNE LECTURE FRAÎCHE, pas de `facts`: le `saveSelf` juste
      // au-dessus vient peut-être de CRÉER la ligne `student_goals`, et l'état
      // d'écran est encore celui d'avant. Fusionner sur une photo périmée
      // effacerait ce qui a été écrit entre les deux.
        const fresh = await readFunnelFacts(userId);
        await saveMouthAllergies({
          userId,
          memberId,
          labels: draft.allergies,
          current: fresh.practicalConstraints,
        });
      } catch (error) {
        // On retire la ligne à moitié écrite, PUIS on relaie le motif d'origine.
        // Si le retrait échoue lui aussi, on ne le cache pas: la relecture
        // montrera la ligne incomplète, et le bouton « Retirer » de sa carte est
        // là pour ça.
        await removeHouseholdMember(memberId).catch(() => undefined);
        await load(false);
        throw error;
      }
      setMouth(emptyMouthDraft());
      await load(false);
    })();
  }

  /**
   * RETIRER UNE BOUCHE — le contrôle que `setup.mouths.remove` attendait.
   *
   * La phrase existait dans le catalogue depuis la livraison de l'étape 2b, et
   * aucun bouton ne l'affichait: une fonctionnalité qu'on croit livrée parce
   * qu'on en a écrit les mots. Ce qui l'a rendue urgente est un compte réel où
   * la même personne s'était inscrite trois fois, sans aucun moyen d'en retirer
   * deux — l'entonnoir est un couloir, donc `/app/household` n'était pas
   * atteignable pour réparer.
   */
  function removeMouth(target: FunnelMouth): Promise<void> {
    return (async () => {
      const result = await removeHouseholdMember(target.memberId!);
      if (!result.ok) throw new Error(result.reason);
      setConfirmRemove(null);
      await load(false);
    })();
  }

  function saveMouthGoal(target: FunnelMouth, goal: MemberGoal | ""): Promise<void> {
    return (async () => {
      const result = await setMemberGoal(target.memberId!, goal || null);
      if (!result.ok) throw new Error(result.reason);
      await load(false);
    })();
  }

  /**
   * RÉPONDRE À LA QUESTION DES ALLERGIES SUR UNE BOUCHE DÉJÀ AJOUTÉE.
   *
   * Le cas nominal est la REPRISE: une bouche saisie sur `/app/household`, ou
   * avant que l'accusé n'existe, arrive ici sans réponse. Sans ce geste, la
   * ligne serait un blocage sans champ — un bouton gris et rien à faire.
   */
  function saveMouthAllergyAnswer(
    target: FunnelMouth,
    labels: string[],
  ): Promise<void> {
    return (async () => {
      await saveMouthAllergies({
        userId,
        memberId: target.memberId!,
        labels,
        current: facts!.practicalConstraints,
      });
      await load(false);
    })();
  }

  /**
   * LE CORPS D'UNE BOUCHE DÉJÀ EN BASE.
   *
   * Cas nominal: la REPRISE, ou une bouche saisie sur `/app/household` avant
   * que l'entonnoir n'existe. Sans ce geste, sa ligne serait un blocage sans
   * champ — `canGenerate` réclame le corps et rien ne permettrait de le donner.
   */
  function saveRowBody(
    target: FunnelMouth,
    heightCm: string,
    weightKg: string,
    gender: MemberGender | "",
  ): Promise<void> {
    return (async () => {
      const h = Number(heightCm);
      const w = Number(weightKg);
      if (!gender || !Number.isFinite(h) || !Number.isFinite(w)) {
        throw new Error(t("setup.missing.member_body"));
      }
      await saveMouthBody({
        memberId: target.memberId!,
        heightCm: h,
        weightKg: w,
        gender,
      });
      await load(false);
    })();
  }

  function saveMouthBirthDate(target: FunnelMouth, raw: string): Promise<void> {
    return (async () => {
      const answer = birthDateAnswer(raw, browserLocalDate());
      if (!answer) throw new Error(t("setup.people.birth_date_error"));
      const result = await setMemberBirthDate(target.memberId!, answer.date);
      if (!result.ok) throw new Error(result.reason);
      await load(false);
    })();
  }

  /**
   * L'INVITATION NE BLOQUE JAMAIS LA GÉNÉRATION (R1). Un plan se compose avec
   * les bouches saisies, invitation envoyée ou non, acceptée ou non.
   *
   * ⚠️ EN LOCAL, AUCUN E-MAIL NE PART, et c'est voulu: `EMAIL_DELIVERY_ENABLED`
   * est un pistolet chargé sur un poste de dev. L'écran REND le lien, et son
   * `{name}` est load-bearing — le maître émet plusieurs liens dans la même
   * minute, et un lien anonyme part à la mauvaise personne.
   */
  function sendInvite(target: FunnelMouth): Promise<void> {
    return (async () => {
      const email = inviteEmail.trim();
      if (!email) throw new Error(t("household.invite.error.bad_email"));
      const result = await inviteToHousehold(email, target.memberId!);
      if (!result.ok) throw new Error(result.reason);
      setInvite({
        memberId: target.memberId!,
        token: String(result.token ?? ""),
        firstName: String(result.first_name ?? target.firstName),
      });
      setInviteEmail("");
    })();
  }

  // ── ÉTAPE 3 — LA SORTIE ──────────────────────────────────────────────────

  /**
   * LE BOUTON QUI COMPOSE.
   *
   * ── LE ROUTAGE EST UN FAIT, PAS LA BRANCHE ─────────────────────────────
   * `generate-household-meal-v1` si le foyer a AU MOINS DEUX bouches, sinon
   * `generate-meal-v1`. On lit le roster, pas la réponse de l'étape 1: un foyer
   * commencé et laissé à une seule bouche recevrait sinon `empty_household` sur
   * un chemin où le générateur individuel marche très bien.
   *
   * ── ET IL NE PEUT PAS ÉCHOUER SUR UN REFUS QUE L'ENTONNOIR FERME ────────
   * `goal_required` est fermé par `own_goal`, `no_household` et
   * `empty_household` par l'étape 1 et le routage ci-dessus, `mode_required` /
   * `window_required` / `unknown_intent` / `replaces_required` par les
   * constantes ci-dessous. Le tableau complet est dans la fiche.
   */
  function compose(): Promise<void> {
    return (async () => {
      await savePlanAnswers({
        userId,
        current: facts!.practicalConstraints,
        answers: plan!,
      });
      // ON RELIT AVANT DE COMPOSER. Le verdict qui a allumé le bouton portait
      // sur un brouillon; celui-ci porte sur ce qui est vraiment en base.
      const fresh = await readFunnelFacts(userId);
      const freshBranch = fresh.branch ?? "solo";
      const last = canGenerate(fresh.state, freshBranch);
      if (!last.ok) {
        setFacts(fresh);
        throw new Error(t(setupMissKey(last.missing[0])));
      }
      // ⚠️ `isOwner` EST LA MOITIÉ DU ROUTAGE, pas une précaution.
      // `generate-household-meal-v1` rend 403 `not_owner` à un secondaire — et
      // c'est voulu: son plan à lui est PERSONNEL (D2 du modèle foyer). Router
      // sur le seul nombre de bouches enverrait toute personne ayant réclamé
      // son profil droit dans un refus que rien ne peut fermer.
      const mouthCount = fresh.mouths.length + (fresh.householdId ? 1 : 0);
      try {
        if (fresh.isOwner && mouthCount >= 2) {
          const result = await generateHouseholdMeal({
            window: { kind: "until_sunday" },
            // `prepare_next` et pas `replace_current`: il n'y a rien à
            // remplacer, et `replace_current` sans cible rend
            // `replaces_required`.
            intent: "prepare_next",
            replaces: null,
            context: null,
          });
          // Un 200 qui dit `ok: false` n'est pas une panne de transport, et il
          // ne doit pas non plus atterrir comme un succès: il rejoint la même
          // table de refus que tout le reste.
          if (!result.ok) throw new Error("plan_not_written");
        } else {
          await generateMeal({
            // `to_shop` et pas `from_pantry`: un premier plan n'a pas de
            // garde-manger déclaré, et `from_pantry` sans articles rend
            // `pantry_required`.
            mode: "to_shop",
            window: { kind: "until_sunday" },
            intent: "prepare_next",
            replaces: null,
            slot: null,
            servings: 1,
            context: null,
            preferences: null,
            pantry: [],
          });
        }
      } catch (error) {
        throw new Error(refusalMessage(error));
      }
      // L'ATTERRISSAGE EST LE PLAN, jamais `/app/today`.
      navigate("/app/plan", { replace: true });
    })();
  }

  // ── LE RENDU ─────────────────────────────────────────────────────────────

  return (
    <FunnelShell>
      <div className="space-y-6">
        {/* UN FIL DE PROGRESSION HONNÊTE: le compte réel des étapes de CETTE
            branche, pas une barre décorative. */}
        <p className="text-label font-semibold uppercase text-ink-soft">
          {t("setup.progress", { n: stepIndex + 1, total: steps.length })}
        </p>

        {failure ? (
          <Card tone="warning">
            <p className="text-sm text-ink">{failure}</p>
          </Card>
        ) : null}
        {flash ? <p className="text-xs text-ink-soft">{flash}</p> : null}

        {step.id === "situate" ? (
          <SituateStep
            current={facts.state.mouths}
            hasHousehold={facts.householdId !== null}
            isOwner={facts.isOwner}
            busy={busy}
            onChoose={chooseSize}
          />
        ) : null}

        {step.id === "people" ? (
          <>
            <SelfStep
              draft={self}
              onChange={setSelf}
              branch={branch}
              // LE BOUTON D'ENREGISTREMENT N'EXISTE QUE QUAND IL Y A UNE SUITE
              // DANS LA MÊME ÉTAPE. En solo, « Continue » enregistre et avance:
              // un second bouton qui fait la moitié du premier ne se distingue
              // de lui que par ce qu'il ne fait pas.
              onSave={branch === "solo" ? null : () => guard(saveSelf)}
              busy={busy}
            />
            {/*
              ── LA QUESTION EST POSÉE SUR L'ÉCRAN QUI LA PORTE ──────────────
              Il y avait ici une porte: tant que la direction du maître n'était
              pas ENREGISTRÉE, cette carte n'était qu'un encart gris renvoyant
              vers le formulaire du dessus. L'intention était bonne — l'accusé
              d'allergie d'une bouche se fusionne dans la ligne `student_goals`
              du maître, qui n'existe qu'une fois sa direction posée — mais le
              geste était faux: le bouton principal de cette étape enregistre
              ET avance, donc sur le chemin nominal on ne voyait jamais la
              porte s'ouvrir. On arrivait à l'étape 3, elle réclamait des
              bouches, et le seul champ pour en ajouter était resté derrière.

              L'ordre d'écriture n'a pas bougé d'un pouce: il est tenu dans
              `addMouth`, qui enregistre le maître avant la première bouche et
              refuse par un motif nommé s'il n'y a pas encore de direction à
              enregistrer.
            */}
            {branch !== "solo" ? (
              <MouthsStep
                mouths={facts.mouths}
                draft={mouth}
                onDraftChange={setMouth}
                onAdd={() => guard(addMouth)}
                onGoal={(m, g) => guard(() => saveMouthGoal(m, g))}
                onBirthDate={(m, d) => guard(() => saveMouthBirthDate(m, d))}
                onAllergyAnswer={(m, labels) =>
                  guard(() => saveMouthAllergyAnswer(m, labels))}
                onBody={(m, h, w, g) => guard(() => saveRowBody(m, h, w, g))}
                onRemove={(m) => guard(() => removeMouth(m))}
                confirmRemove={confirmRemove}
                onConfirmRemove={setConfirmRemove}
                inviteFor={inviteFor}
                onInviteFor={(id) => {
                  setInviteFor(id);
                  setInvite(null);
                }}
                inviteEmail={inviteEmail}
                onInviteEmail={setInviteEmail}
                onInvite={(m) => guard(() => sendInvite(m))}
                invite={invite}
                busy={busy}
              />
            ) : null}
            {/* CE QUI RETIENT, DIT PAR SON MOTIF — et seulement après avoir
                essayé de partir. La liste est celle des faits, donc elle
                rétrécit à chaque réponse et disparaît d'elle-même. */}
            {heldBack && stepMissing.length > 0 ? (
              <MissingCard missing={stepMissing} />
            ) : null}
          </>
        ) : null}

        {step.id === "plan" ? (
          <PlanStep draft={plan} onChange={setPlan} missing={missing} />
        ) : null}

        {/* LA BARRE D'ACTION, ET ELLE NE PORTE AUCUNE SORTIE.
            ── CE QUI A ÉTÉ RETIRÉ LE 2026-08-13, ET POURQUOI ──────────────
            Il y avait ici un « Skip for now » vers `/app/today`, sous la
            bannière « personne n'est retenu dans un couloir ». Décision
            humaine renversée: pendant l'entrée, il n'y a rien d'autre à
            faire, et un lien qui mène ailleurs est un lien qu'on prend —
            après quoi on atterrit sur des écrans vides, on juge le produit
            là-dessus, et on ne revient pas.
            Le « skip » était de toute façon en grande partie une illusion:
            `resolveHomePath` renvoie ici tant qu'il n'y a pas de ligne
            `student_goals`, et la garde de route le rejoue maintenant à
            chaque écran de l'app. Ce qui reste comme échappatoire est la
            seule qui soit honnête: se déconnecter. */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap gap-2">
            {stepIndex > 0 ? (
              <Button
                variant="secondary"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                disabled={busy}
              >
                {t("setup.back")}
              </Button>
            ) : null}
            {step.id === "people" ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  guard(async () => {
                    await saveSelf();
                    // ── UNE ÉTAPE NE SE LAISSE PAS QUITTER INCOMPLÈTE ───────
                    // Et la relecture est FRAÎCHE, pas `facts`: `saveSelf`
                    // vient d'écrire, l'état d'écran ne le sait pas encore, et
                    // trancher sur la photo d'avant retiendrait quelqu'un qui
                    // vient exactement de répondre.
                    const fresh = await readFunnelFacts(userId);
                    const held = missesForStep(
                      { ...fresh.state, plan },
                      fresh.branch ?? branch,
                      "people",
                    );
                    if (held.length > 0) {
                      setHeldBack(true);
                      return;
                    }
                    setHeldBack(false);
                    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
                  })}
              >
                {t("setup.next")}
              </Button>
            ) : null}
            {isLast ? (
              <Button
                variant="primary"
                // LA SEULE SOURCE. Voir `previewState`: rien d'autre ne décide.
                disabled={busy || !verdict.ok}
                onClick={() => guard(compose)}
              >
                {busy ? t("setup.plan.composing") : t("setup.plan.compose")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </FunnelShell>
  );
}

/**
 * LE CHROME DE L'ENTRÉE — ET IL N'A PAS DE NAVIGATION.
 *
 * ── POURQUOI PAS `KeelAppShell` ────────────────────────────────────────────
 * Elle rend les huit onglets de l'app élève et la barre du bas sur téléphone.
 * Sur cet écran-là, chacun est une porte vers un écran VIDE: quelqu'un qui n'a
 * pas encore de plan n'a rien à voir sur `/app/today`, `/app/plan` ou
 * `/app/progress`. Mesuré en vrai: on quitte l'entrée par curiosité, on tombe
 * sur du vide, et on juge le produit là-dessus.
 *
 * ── LA MARQUE N'EST PAS UN LIEN ────────────────────────────────────────────
 * Partout ailleurs le mot-symbole ramène à l'accueil. Ici il ne ramène nulle
 * part: c'est le dernier lien qui restait, et un couloir avec une porte est un
 * couloir qu'on quitte.
 *
 * ── CE QUI RESTE CLIQUABLE, ET C'EST DÉLIBÉRÉ ──────────────────────────────
 * Le sélecteur de langue. Il ne fait pas sortir (il recharge la même page), et
 * quelqu'un qui ne lit pas l'anglais doit pouvoir répondre à des questions dont
 * dépend ce qu'il va manger. La vraie sortie — se déconnecter — reste
 * disponible sur `/account`, et elle ne s'atteint pas par accident.
 */
function FunnelShell({ children }: { children: React.ReactNode }) {
  return (
    // ── LE FOND EST `paper`, ET C'ÉTAIT `bg-white`: UN DÉFAUT MESURÉ ───────
    // Le blanc pur est le seul neutre que la charte refuse (aucune
    // température). Sous les cartes du kit, qui sont en `paper` (#FBF8FA), il
    // inversait le rapport: mesuré au navigateur le 2026-08-13, l'INTÉRIEUR
    // des cartes était plus chaud que la page qui les portait, donc chaque
    // carte se lisait comme un creux et non comme une pièce posée.
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-4">
          {/* L'ÉQUERRE SUR LE MOT-SYMBOLE, comme dans `PublicHeader`: elle
              « marque l'origine de ce qui est spécifié » (charte §4), et le nom
              de la marque en est une. Il y a un mot à sa droite — c'est la
              condition, et elle est tenue.
              ⚠️ PAS de `px-*` sur ce nœud: `.eq` pose `padding-left: 1.125rem`
              hors de toute couche CSS et bat un utilitaire de même
              spécificité. Le `px-4` vit sur le parent.
              `text-xl` = 20px, le PLANCHER de Young Serif — en dessous, c'est
              Public Sans (charte §3). `PublicHeader` la pose à 18px et
              `PublicFooter` à 14px: les deux sont sous le plancher, signalé. */}
          <span className="eq shrink-0 font-display text-lg leading-none text-ink">
            {t("brand.wordmark")}
          </span>
          <LocaleSwitch />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        {/* LE MÊME `h1` QUE LE KIT, ET C'EST LE POINT: `font-display text-title`
            est ce que rend `ui/Page.tsx#PageHeader` sur les seize écrans, et ce
            que rendent `/start` et `/auth`. Cet écran-ci ne peut pas employer
            `PageHeader` — il n'a ni la coque ni la nav de l'app — mais le
            premier écran du produit ne doit pas être le seul dont le titre
            n'est pas de la maison.
            ⛔ AUCUNE GRAISSE ICI (c'était `text-2xl font-semibold`): Young Serif
            n'a qu'une graisse, le navigateur la simulerait en épaississant les
            contours. La hiérarchie se fait à la taille et à l'espace. */}
        <h1 className="text-balance font-display text-title text-ink">{t("setup.title")}</h1>
        <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-ink-soft">
          {t("setup.subtitle")}
        </p>
        {/* LE TRAIT QUI FERME LE BLOC D'IDENTITÉ. La direction est « la fiche
            technique » (charte §1): une fiche a une tête — qui elle concerne —
            puis un trait, puis ses champs. Le compte d'étapes se lit juste en
            dessous, au cran `text-label`, comme la référence d'un document. */}
        <div className="mt-8 border-t border-line pt-8">{children}</div>
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ÉTAPE 1
// ───────────────────────────────────────────────────────────────────────────

function SituateStep({
  current,
  hasHousehold,
  isOwner,
  busy,
  onChoose,
}: {
  current: number | null;
  hasHousehold: boolean;
  isOwner: boolean;
  busy: boolean;
  onChoose: (mouths: number) => void;
}) {
  // UN SECONDAIRE N'A PAS CETTE QUESTION À RÉPONDRE. Quelqu'un d'autre gouverne
  // la table, et lui proposer trois cartes serait promettre un geste que la
  // base refusera (`not_owner`). On dit l'état, on ne demande rien.
  if (!isOwner) {
    return (
      <Card>
        <SectionLabel>{t("setup.situate.title")}</SectionLabel>
        <p className="mt-2 text-sm text-ink-soft">{t("setup.situate.member")}</p>
      </Card>
    );
  }
  const branch = branchForMouths(current);
  const options: Array<{ mouths: number; key: FunnelBranch; title: string; hint: string }> = [
    { mouths: 1, key: "solo", title: t("setup.situate.solo"), hint: t("setup.situate.solo_hint") },
    { mouths: 2, key: "pair", title: t("setup.situate.pair"), hint: t("setup.situate.pair_hint") },
    { mouths: 3, key: "family", title: t("setup.situate.family"), hint: t("setup.situate.family_hint") },
  ];
  return (
    <Card>
      <SectionLabel>{t("setup.situate.title")}</SectionLabel>
      <p className="mt-2 text-sm text-ink-soft">{t("setup.situate.hint")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {options.map((option) => {
          // ⚠️ « JUSTE MOI » SE DÉSARME QUAND UN FOYER EXISTE. Cet écran ne
          // supprime pas un foyer: ce serait effacer des bouches, leurs
          // allergies et leurs portions sur un clic d'entonnoir. Le geste
          // existe, il vit sur `/app/household`, où il porte son avertissement.
          const locked = option.mouths === 1 && hasHousehold;
          const chosen = branch === option.key;
          return (
            <button
              key={option.key}
              type="button"
              disabled={busy || locked}
              // LE CHOIX COURANT EST DIT AUTREMENT QUE PAR LA COULEUR. Sans
              // ceci, « laquelle des trois est la mienne » ne passait que par
              // une bordure teintée: invisible à un lecteur d'écran, et seule
              // porteuse de l'information au sens de WCAG 1.4.1.
              aria-pressed={chosen}
              onClick={() => onChoose(option.mouths)}
              className={[
                // `rounded-card` (12px) et pas `rounded-xl`: le rayon RENDU est
                // le même, il porte enfin son nom — le vocabulaire du kit est
                // `part` (4px) · `card` (12px) · `fiche` (16px) · `full`
                // (boutons et pastilles), et rien d'autre.
                "rounded-card border p-4 text-left transition-colors",
                // ── POURQUOI LE LAVIS ET PAS L'APLAT DE MARQUE ──────────────
                // Une pastille choisie prend l'aplat plein (`bg-fig-700`), et
                // c'est l'idiome de la maison — voir `MealPrepPage.tsx:325`.
                // Ici la surface est une TUILE de 200px: un aplat de marque à
                // cette taille devient le bloc dominant de l'écran, et il
                // faudrait remonter le sous-titre à `fig-300` pour qu'il se
                // lise. `fig-100` est le lavis, « un remplissage qui doit se
                // lire PLEIN » (charte §5), fermé par un trait `fig-700`:
                // `ink` dessus = 13,42:1, `ink-soft` = 5,07:1.
                chosen
                  ? "border-fig-700 bg-fig-100"
                  // Le non-choisi est le geste secondaire du kit, et c'est mot
                  // pour mot la grande commande de `/auth` (`Auth.tsx:1340`) —
                  // la porte que le visiteur vient de franchir: un contour de
                  // CONTRÔLE (`line-strong`, 3,84:1 — WCAG 1.4.11 exige 3:1)
                  // sur le même papier que tout le reste. Le survol emprunte le
                  // lavis clair `fig-50`, donc il ne peut pas se confondre avec
                  // le lavis plein `fig-100` du choix retenu.
                  : "border-line-strong bg-paper",
                locked ? "cursor-not-allowed opacity-50" : "hover:bg-fig-50",
              ].join(" ")}
            >
              <span className="block text-sm font-medium text-ink">
                {option.title}
              </span>
              {/* `min-w-0` n'est pas nécessaire ici (pas de flex), mais le texte
                  doit se replier à 320 px: pas de `whitespace-nowrap`. */}
              <span className="mt-1 block text-xs leading-5 text-ink-soft">
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ÉTAPE 2 — MOI
// ───────────────────────────────────────────────────────────────────────────

function SelfStep({
  draft,
  onChange,
  branch,
  onSave,
  busy,
}: {
  draft: SelfDraft;
  onChange: React.Dispatch<React.SetStateAction<SelfDraft | null>>;
  branch: FunnelBranch;
  /** `null` en solo: « Continue » fait déjà tout, et deux boutons mentiraient. */
  onSave: (() => void) | null;
  busy: boolean;
}) {
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
      <SectionLabel>{t("setup.people.title")}</SectionLabel>
      <p className="mt-2 text-sm text-ink-soft">{t("setup.people.intro")}</p>

      <div className="mt-4 space-y-4">
        {/* LE PRÉNOM N'EST DEMANDÉ QUE S'IL Y A UN FOYER — rien, dans le chemin
            individuel, ne lit le prénom du mangeur. Voir `FUNNEL_QUESTIONS`. */}
        {branch !== "solo" ? (
          <Field
            label={t("setup.people.first_name")}
            hint={t("setup.people.first_name_hint")}
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("setup.people.birth_date")}
            hint={t("setup.people.birth_date_hint")}
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
          <Field
            label={t("setup.people.height")}
            hint={t("setup.people.height_hint")}
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
        </div>

        {/* LE POIDS. Bornes de `student_body_measures_value_in_range`, la table
            qui arme `restriction_guard` — pas celles, plus larges, de la RPC de
            foyer. */}
        <Field
          label={t("setup.people.weight")}
          hint={t("setup.people.weight_hint")}
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

        <Field label={t("setup.people.goal")} htmlFor="setup-goal">
          <select
            id="setup-goal"
            value={draft.goal}
            onChange={(e) => set({ goal: e.target.value as MemberGoal })}
            className={inputClass}
          >
            <option value="">—</option>
            {MEMBER_GOALS.map((g) => (
              <option key={g} value={g}>
                {goalLabel(g)}
              </option>
            ))}
          </select>
        </Field>

        {/* LE RÉGIME AVANT LES ALLERGIES. C'est la question qui écarte le
            plus de choses, et l'ordre évite de cocher « poisson » sous
            allergie quand la vraie réponse est « je suis végétarien ». */}
        <Field label={t("setup.people.diet")} hint={t("setup.people.diet_hint")}>
          <div className="flex flex-wrap gap-2">
            {DIET_ANSWERS.map((diet) => (
              <Button
                key={diet}
                size="sm"
                variant={draft.diet === diet ? "primary" : "secondary"}
                onClick={() => set({ diet })}
              >
                {t(`setup.people.diet_${diet}` as "setup.people.diet_omnivore")}
              </Button>
            ))}
          </div>
        </Field>

        <AllergyPicker
          label={t("setup.people.allergies")}
          hint={t("setup.people.allergies_hint")}
          idPrefix="setup-self"
          allergies={draft.allergies}
          none={draft.allergiesNone}
          onChange={(allergies, none) => set({ allergies, allergiesNone: none })}
        />

        {onSave ? (
          <Button variant="secondary" disabled={busy} onClick={onSave}>
            {t("household.member.save")}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ÉTAPE 2b — LES AUTRES BOUCHES
// ───────────────────────────────────────────────────────────────────────────

function MouthsStep(props: {
  mouths: FunnelMouth[];
  draft: MouthDraft;
  onDraftChange: React.Dispatch<React.SetStateAction<MouthDraft>>;
  onAdd: () => void;
  onGoal: (mouth: FunnelMouth, goal: MemberGoal | "") => void;
  onBirthDate: (mouth: FunnelMouth, date: string) => void;
  onAllergyAnswer: (mouth: FunnelMouth, labels: string[]) => void;
  onBody: (
    mouth: FunnelMouth,
    heightCm: string,
    weightKg: string,
    gender: MemberGender | "",
  ) => void;
  onRemove: (mouth: FunnelMouth) => void;
  confirmRemove: string | null;
  onConfirmRemove: (memberId: string | null) => void;
  inviteFor: string | null;
  onInviteFor: (memberId: string | null) => void;
  inviteEmail: string;
  onInviteEmail: (value: string) => void;
  onInvite: (mouth: FunnelMouth) => void;
  invite: { memberId: string; token: string; firstName: string } | null;
  busy: boolean;
}) {
  const draft = props.draft;
  const set = (patch: Partial<MouthDraft>) =>
    // Fonctionnelle, pour la même raison que dans `SelfStep`: deux clics dans
    // le même tick partiraient sinon du même état et l'un écraserait l'autre.
    props.onDraftChange((prev) => ({ ...prev, ...patch }));
  const full = props.mouths.length + 1 >= HOUSEHOLD_MAX_MOUTHS;

  return (
    <Card>
      <SectionLabel>{t("setup.mouths.title")}</SectionLabel>
      <p className="mt-2 text-sm text-ink-soft">{t("setup.mouths.intro")}</p>

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
                onBody={(h, w, g) => props.onBody(m, h, w, g)}
                onRemove={() => props.onRemove(m)}
                confirmRemove={props.confirmRemove === m.memberId}
                onConfirmRemove={() =>
                  props.onConfirmRemove(
                    props.confirmRemove === m.memberId ? null : m.memberId ?? null,
                  )}
                inviteOpen={props.inviteFor === m.memberId}
                onInviteOpen={() =>
                  props.onInviteFor(props.inviteFor === m.memberId ? null : m.memberId)}
                inviteEmail={props.inviteEmail}
                onInviteEmail={props.onInviteEmail}
                onInvite={() => props.onInvite(m)}
                invite={props.invite?.memberId === m.memberId ? props.invite : null}
                busy={props.busy}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {full ? (
        // LE PLAFOND EST EN BASE (`household_full`). Cet écran ne fait que le
        // DIRE — « une limite d'UI n'est pas une limite ».
        <p className="mt-4 text-xs text-ink-soft">{t("setup.mouths.full")}</p>
      ) : (
        // LE FORMULAIRE D'AJOUT EST ENCADRÉ EN POINTILLÉ, et les personnes déjà
        // là en trait plein: le pointillé dit « pas encore quelqu'un ». Sans
        // cadre, il se lisait comme la suite de la dernière carte — donc comme
        // des champs vides SUR une personne existante.
        <div className="mt-4 space-y-4 rounded-card border border-dashed border-line-strong p-4">
          <Field
            label={t("setup.people.first_name")}
            hint={t("setup.mouths.first_name_hint")}
            htmlFor="setup-mouth-name"
          >
            <input
              id="setup-mouth-name"
              type="text"
              maxLength={40}
              value={draft.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label={t("setup.mouths.kind")} hint={t("setup.mouths.kind_hint")}>
            <div className="flex flex-wrap gap-2">
              {(["adult", "child"] as const).map((kind) => (
                <Button
                  key={kind}
                  variant={draft.kind === kind ? "primary" : "secondary"}
                  size="sm"
                  onClick={() =>
                    // Repasser en « enfant » EFFACE l'objectif du brouillon: un
                    // mineur n'en a jamais, et le garder en mémoire le ferait
                    // repartir au prochain basculement.
                    set({ kind, goal: kind === "child" ? "" : draft.goal })}
                >
                  {kind === "adult" ? t("setup.mouths.kind_adult") : t("setup.mouths.kind_child")}
                </Button>
              ))}
            </div>
          </Field>

          <Field
            label={t("setup.people.birth_date")}
            hint={t("setup.people.birth_date_hint")}
            htmlFor="setup-mouth-birth"
          >
            <input
              id="setup-mouth-birth"
              type="date"
              value={draft.birthDate}
              max={browserLocalDate()}
              onChange={(e) => set({ birthDate: e.target.value })}
              className={inputClass}
            />
          </Field>

          {/* LE CORPS D'UNE BOUCHE — TOUT-OU-RIEN, comme la base.
              Les bornes sont celles de `keel_household_set_member_body`
              (30–260 cm, 2–400 kg) et pas celles de `profiles`: une bouche peut
              être un enfant de trois ans, que les bornes adultes refuseraient. */}
          <Field label={t("setup.mouths.body")} hint={t("setup.mouths.body_hint")}>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                id="setup-mouth-height"
                type="number"
                inputMode="numeric"
                min={30}
                max={260}
                placeholder={t("setup.people.height")}
                aria-label={t("setup.people.height")}
                value={draft.heightCm}
                onChange={(e) => set({ heightCm: e.target.value })}
                className={`${inputClass} min-w-0`}
              />
              <input
                id="setup-mouth-weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                min={2}
                max={400}
                placeholder={t("setup.people.weight")}
                aria-label={t("setup.people.weight")}
                value={draft.weightKg}
                onChange={(e) => set({ weightKg: e.target.value })}
                className={`${inputClass} min-w-0`}
              />
              <select
                id="setup-mouth-gender"
                aria-label={t("setup.people.gender")}
                value={draft.gender}
                onChange={(e) => set({ gender: e.target.value as MemberGender })}
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
          </Field>

          {/* ── UN ENFANT PEUT PORTER UNE DIRECTION (2026-08-13) ────────────
              Le champ était réservé aux adultes: `PIVOT-FOYER.md` §8.4 disait
              qu'un mineur n'a « jamais d'objectif nutritionnel individuel ».
              Décision humaine renversée — la règle était plus large que sa
              raison, qui est « jamais CORRECTIF SUR LE CORPS: aucune mention de
              poids, de silhouette, de restriction ».

              Ce qui reste fermé est donc la LISTE, pas le champ: les deux
              directions qui retirent (`fat_loss`, `recomposition`) ne sont pas
              proposées à un enfant, et la base les refuse à l'écriture
              (`goal_not_for_minor`) — l'écran ne cache pas une option que le
              serveur accepterait. */}
          <Field label={t("setup.mouths.goal")} htmlFor="setup-mouth-goal">
              <select
                id="setup-mouth-goal"
                value={draft.goal}
                onChange={(e) => set({ goal: e.target.value as MemberGoal })}
                className={inputClass}
              >
                <option value="">{t("setup.mouths.goal_none")}</option>
                {goalsForAge(draft.kind).map((g) => (
                  <option key={g} value={g}>
                    {goalLabel(g)}
                  </option>
                ))}
              </select>
          </Field>

          <AllergyPicker
            label={t("setup.mouths.allergies")}
            hint={t("setup.people.allergies_hint")}
            idPrefix="setup-mouth"
            allergies={draft.allergies}
            none={draft.allergiesNone}
            onChange={(allergies, none) => set({ allergies, allergiesNone: none })}
          />

          <Button variant="secondary" disabled={props.busy} onClick={props.onAdd}>
            {t("setup.mouths.add")}
          </Button>
        </div>
      )}
    </Card>
  );
}

function MouthRow(props: {
  mouth: FunnelMouth;
  onGoal: (goal: MemberGoal | "") => void;
  onBirthDate: (date: string) => void;
  onAllergyAnswer: (labels: string[]) => void;
  onBody: (heightCm: string, weightKg: string, gender: MemberGender | "") => void;
  onRemove: () => void;
  confirmRemove: boolean;
  onConfirmRemove: () => void;
  inviteOpen: boolean;
  onInviteOpen: () => void;
  inviteEmail: string;
  onInviteEmail: (value: string) => void;
  onInvite: () => void;
  invite: { token: string; firstName: string } | null;
  busy: boolean;
}) {
  const m = props.mouth;
  const [date, setDate] = React.useState("");
  const [allergies, setAllergies] = React.useState<string[]>([]);
  const [none, setNone] = React.useState(false);
  const [bodyHeight, setBodyHeight] = React.useState("");
  const [bodyWeight, setBodyWeight] = React.useState("");
  const [bodyGender, setBodyGender] = React.useState<MemberGender | "">("");
  const onFile = m.birthDate === BIRTH_DATE_ON_FILE;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* LE PRÉNOM EN TÊTE DE SECTION, et pas une ligne de texte parmi
            d'autres: c'est ce qui dit « ici commence quelqu'un d'autre ». */}
        <span className="min-w-0 text-base font-semibold text-ink">
          {m.firstName || "—"}
        </span>
        {/* LA NATURE DE LA BOUCHE PASSE DANS UNE PASTILLE `neutral`, ET C'EST
            LE KIT QUI LE DEMANDE: `Badge` a un ton pour « tout ce qui n'est
            qu'une étiquette », et « adulte / enfant » en est une — pas un état
            du système, donc ni émeraude, ni ambre, ni rouge, ni bleu, et
            surtout pas la figue (elle n'entre jamais dans une pastille).
            Elle paie aussi une lisibilité mesurée: en `text-xs text-gray-500`
            au bout d'une ligne, la nature se confondait avec les phrases
            d'aide en dessous, et trois lignes de bouches se lisaient comme un
            seul formulaire. La pastille rend le début de chaque ligne. */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge>
            {m.kind === "child" ? t("setup.mouths.kind_child") : t("setup.mouths.kind_adult")}
          </Badge>
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

      {/* LA DATE NE SE PRÉREMPLIT PAS, ET C'EST LA BASE QUI LE DÉCIDE: le
          roster NE REND JAMAIS la date d'une bouche (le foyer doit savoir qu'il
          y a un enfant à table, pas son âge). On sait seulement qu'elle EXISTE,
          parce que l'âge n'est plus `unknown`. */}
      {onFile ? (
        <p className="text-xs text-ink-soft">{t("household.member.birth_date_kept")}</p>
      ) : (
        <Field
          label={t("setup.people.birth_date")}
          hint={t("setup.people.birth_date_hint")}
          htmlFor={`setup-mouth-date-${m.memberId}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`setup-mouth-date-${m.memberId}`}
              type="date"
              value={date}
              max={browserLocalDate()}
              onChange={(e) => setDate(e.target.value)}
              // `min-w-0` EST LA CORRECTION, pas du confort: `min-width: auto`
              // sur un enfant flex l'empêche de rétrécir, et la ligne déborde à
              // 320 px.
              className={`${inputClass} min-w-0 flex-1`}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={props.busy || !date}
              onClick={() => props.onBirthDate(date)}
            >
              {t("household.member.save")}
            </Button>
          </div>
        </Field>
      )}

      {m.claimed && m.kind === "child" ? null : (
        m.claimed ? (
          // ⚠️ D1 DU CHANTIER FOYER: dès qu'une bouche a un compte, son objectif
          // vit dans SON « about you ». Le champ n'est donc pas ici — et le dire
          // évite qu'on cherche un réglage qui n'existe plus à cet endroit.
          <p className="text-xs text-ink-soft">{t("setup.mouths.goal_from_profile")}</p>
        ) : (
          <Field label={t("setup.mouths.goal")} htmlFor={`setup-mouth-g-${m.memberId}`}>
            <select
              id={`setup-mouth-g-${m.memberId}`}
              value={m.goal ?? ""}
              disabled={props.busy}
              onChange={(e) => props.onGoal(e.target.value as MemberGoal | "")}
              className={inputClass}
            >
              <option value="">{t("setup.mouths.goal_none")}</option>
              {goalsForAge(m.kind).map((g) => (
                <option key={g} value={g}>
                  {goalLabel(g)}
                </option>
              ))}
            </select>
          </Field>
        )
      )}

      {/* LE CORPS, QUAND IL MANQUE. Même raison que le bloc d'allergies
          ci-dessous: sans champ sur la ligne, `canGenerate` réclamerait un
          corps que rien ne permettrait de donner — un bouton gris et rien à
          faire. C'est le cas nominal d'une bouche saisie sur
          `/app/household`, ou d'une reprise. */}
      {m.heightCm === null || m.weightKg === null || m.gender === null ? (
        <Field label={t("setup.mouths.body")} hint={t("setup.mouths.body_hint")}>
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
                className={`${inputClass} min-w-0`}
              />
              <select
                aria-label={t("setup.people.gender")}
                value={bodyGender}
                onChange={(e) => setBodyGender(e.target.value as MemberGender)}
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
            <Button
              variant="secondary"
              size="sm"
              disabled={props.busy || !bodyGender || !bodyHeight || !bodyWeight}
              onClick={() => props.onBody(bodyHeight, bodyWeight, bodyGender)}
            >
              {t("household.member.save")}
            </Button>
          </div>
        </Field>
      ) : null}

      {/* LA QUESTION DE SÉCURITÉ, QUAND ELLE N'A PAS DE RÉPONSE.
          Le cas nominal est la reprise, ou une bouche saisie sur
          `/app/household`. Sans ce bloc, `canGenerate` réclamerait
          `member_allergies` et la ligne n'offrirait AUCUN champ pour y
          répondre: un bouton gris, et rien à faire. */}
      {!m.allergiesReviewed ? (
        <div className="space-y-2">
          <AllergyPicker
            label={t("setup.mouths.allergies")}
            hint={t("setup.people.allergies_hint")}
            idPrefix={`setup-row-${m.memberId}`}
            allergies={allergies}
            none={none}
            onChange={(next, isNone) => {
              setAllergies(next);
              setNone(isNone);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={props.busy || (!none && allergies.length === 0)}
            onClick={() => props.onAllergyAnswer(allergies)}
          >
            {t("household.member.save")}
          </Button>
        </div>
      ) : null}

      {/* L'ACCÈS — UN AJOUT PAR-DESSUS, JAMAIS UNE ALTERNATIVE. On a déjà
          ajouté la bouche; ceci ne fait que permettre à quelqu'un de la
          reprendre. D'où l'absence totale de fourche à la saisie. */}
      {!m.claimed ? (
        <div>
          {/* ── `secondary` ET PLUS `ghost`, ET C'EST UN DÉFAUT MESURÉ ────────
              `ghost` ne rend que du texte `ink-soft` sans contour. Ce bouton
              vit au milieu de trois phrases d'aide qui sont, elles aussi, en
              `ink-soft`: vu au navigateur le 2026-08-13, il ne se distinguait
              pas d'une ligne de prose, sur la seule ligne de cette liste qui
              OUVRE quelque chose. Le geste reste facultatif — c'est le rôle de
              `ghost` — mais un geste facultatif doit rester reconnaissable
              comme geste. */}
          <Button variant="secondary" size="sm" onClick={props.onInviteOpen}>
            {t("setup.access.title")}
          </Button>
          {props.inviteOpen ? (
            // LE PANNEAU IMBRIQUÉ SE DIT PAR `paper-2` + UN TRAIT, pas par un
            // gris froid: c'est l'idiome du fronton de `ui/SetupSection.tsx`,
            // et c'est le seul remplissage disponible sous une carte `paper`
            // (`ink-soft` sur `paper-2` = 5,67:1).
            <div className="mt-2 space-y-2 rounded-card border border-line bg-paper-2 p-3">
              <p className="text-xs leading-5 text-ink-soft">
                {t("setup.access.waiting")}
              </p>
              <p className="text-xs leading-5 text-ink-soft">
                {t("setup.access.grants")}
              </p>
              <p className="text-xs leading-5 text-ink-soft">
                {t("setup.access.goal_carries")}
              </p>
              {/* ── UNE COLONNE SOUS `sm`, ET C'EST UN DÉFAUT MESURÉ ─────────
                  C'était `flex flex-wrap items-center gap-2` avec le champ en
                  `flex-1`. `flex-wrap` ne sauve rien ici: le champ, étant
                  élastique, se laisse comprimer plutôt que de pousser le bouton
                  à la ligne. Mesuré à 320 px le 2026-08-13: le champ tombait à
                  **84 px** à côté d'un bouton dont le libellé fait toute la
                  largeur — on ne saisit pas une adresse e-mail dans 84 px.
                  `items-start` empêche le bouton de s'étirer sur toute la
                  largeur en colonne (`align-items` vaut `stretch` par défaut,
                  et `Button` est un `inline-flex`). */}
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                <input
                  type="email"
                  placeholder={t("setup.access.email")}
                  value={props.inviteEmail}
                  onChange={(e) => props.onInviteEmail(e.target.value)}
                  className={`${inputClass} min-w-0 sm:flex-1`}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={props.busy}
                  onClick={props.onInvite}
                >
                  {t("setup.access.submit")}
                </Button>
              </div>
              {props.invite ? (
                <div className="space-y-1">
                  <p className="text-xs text-ink-soft">
                    {t("household.invite.link_ready", { name: props.invite.firstName })}
                  </p>
                  {/* LE LIEN EST RENDU, PAS ENVOYÉ. En local, aucun e-mail ne
                      part — et l'écran doit donc donner de quoi le
                      transmettre à la main. */}
                  {/* `text-xs` remplace un `text-[0.6875rem]` hors échelle. Le
                      cran de la charte à cette taille est `text-label`, mais il
                      met en CAPITALES et ouvre l'approche à +0,1em: un jeton
                      d'invitation à recopier ne survit ni à l'un ni à l'autre.
                      12 px sur l'échelle valent mieux que 11 px hors d'elle. */}
                  <code className="block break-all rounded-card border border-line bg-paper p-2 text-xs text-ink">
                    {`${window.location.origin}/join-household?token=${props.invite.token}`}
                  </code>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ÉTAPE 3
// ───────────────────────────────────────────────────────────────────────────

function PlanStep({
  draft,
  onChange,
  missing,
}: {
  draft: FunnelPlanAnswers;
  onChange: React.Dispatch<React.SetStateAction<FunnelPlanAnswers | null>>;
  missing: readonly FunnelMissId[];
}) {
  const toggle = (list: readonly string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <>
      <Card>
        <SectionLabel>{t("setup.plan.title")}</SectionLabel>
        <p className="mt-2 text-sm text-ink-soft">{t("setup.plan.intro")}</p>

        <div className="mt-4 space-y-4">
          <Field label={t("setup.plan.rhythm")} hint={t("setup.plan.rhythm_hint")}>
            <div className="flex flex-wrap gap-2">
              {EATING_OCCASIONS.map((slot) => (
                <Button
                  key={slot}
                  size="sm"
                  variant={draft.eatingRhythm.includes(slot) ? "primary" : "secondary"}
                  onClick={() =>
                    onChange((prev) =>
                      prev === null
                        ? prev
                        : { ...prev, eatingRhythm: toggle(prev.eatingRhythm, slot) })}
                >
                  {occasionLabel(slot)}
                </Button>
              ))}
            </div>
          </Field>

          <Field label={t("setup.plan.cook_days")} hint={t("setup.plan.cook_days_hint")}>
            <div className="flex flex-wrap gap-2">
              {DAY_TOKENS.map((day) => (
                <Button
                  key={day}
                  size="sm"
                  variant={draft.cookDays.includes(day) ? "primary" : "secondary"}
                  onClick={() =>
                    onChange((prev) =>
                      prev === null
                        ? prev
                        : { ...prev, cookDays: toggle(prev.cookDays, day) })}
                >
                  {dayLabel(day)}
                </Button>
              ))}
            </div>
          </Field>

          {/* ── DES DURÉES, PAS UN NOMBRE À INVENTER ──────────────────────
              Le champ était libre (5 à 240) et ne voulait rien dire: « 37 »
              n'est pas une réponse qu'un humain a. Le moteur écrit de toute
              façon « about ${n} minutes » — un nombre exact y est une fausse
              précision.

              ⚠️ UNE VALEUR HORS LISTE GARDE SA PLACE. La carte de `/app/plan`
              conserve son champ libre: quelqu'un qui y a saisi 37 doit
              retrouver « 37 min » sélectionné ici, et pas une rangée où rien
              n'est coché au-dessus d'une valeur pourtant enregistrée. */}
          <Field label={t("setup.plan.time")} hint={t("setup.plan.time_hint")}>
            <div className="flex flex-wrap gap-2">
              {(draft.cookingTimeMin !== null &&
                  !COOKING_SESSION_MINUTES.includes(draft.cookingTimeMin)
                ? [...COOKING_SESSION_MINUTES, draft.cookingTimeMin].sort((a, b) => a - b)
                : COOKING_SESSION_MINUTES).map((minutes) => {
                const parts = cookingTimeParts(minutes);
                return (
                  <Button
                    key={minutes}
                    size="sm"
                    variant={draft.cookingTimeMin === minutes ? "primary" : "secondary"}
                    onClick={() =>
                      onChange((prev) =>
                        prev === null ? prev : { ...prev, cookingTimeMin: minutes })}
                  >
                    {t(
                      parts.unit === "hours"
                        ? "setup.plan.time_hours"
                        : "setup.plan.time_minutes",
                      { n: parts.value },
                    )}
                  </Button>
                );
              })}
            </div>
          </Field>

          {/* ── UN CHIFFRE, ET PLUS TROIS PASTILLES ────────────────────────
              « Serré / normal / confortable » partait au modèle tel quel, et
              ces trois mots ne désignent pas la même semaine selon la table.
              Un montant se compare au panier: c'est ce qui permet de RENONCER
              À LA VIANDE plutôt que de « faire attention ».

              Pas de symbole monétaire: il faudrait une table pays → devise,
              c'est-à-dire une liste fermée qui refuserait un pays légitime le
              jour où quelqu'un s'y inscrit. Le prompt, lui, porte déjà le
              pays. */}
          <Field
            label={t("setup.plan.budget")}
            hint={t("setup.plan.budget_hint")}
            htmlFor="setup-budget"
          >
            <input
              id="setup-budget"
              type="number"
              inputMode="decimal"
              min={1}
              max={BUDGET_MAX}
              step="1"
              value={draft.budgetAmount === null ? "" : String(draft.budgetAmount)}
              onChange={(e) => {
                const raw = e.target.value.trim();
                const amount = raw === "" ? null : Number(raw);
                onChange((prev) =>
                  prev === null ? prev : {
                    ...prev,
                    // `Number("")` vaut 0 et EST fini — le piège qui avait déjà
                    // affiché une taille pré-remplie à 0 sur un compte neuf.
                    budgetAmount: amount === null || !Number.isFinite(amount)
                      ? null
                      : amount,
                  }
                );
              }}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      {missing.length > 0 ? <MissingCard missing={missing} /> : (
        <p className="text-xs text-ink-soft">{t("setup.plan.compose_hint")}</p>
      )}
    </>
  );
}

/**
 * CE QUI MANQUE, DIT PAR SON MOTIF.
 *
 * Un bouton gris sans explication est la moitié d'un refus — et le motif de D1
 * dit ce que l'absence COÛTE, pas seulement qu'un champ est vide.
 *
 * Le même bloc sert aux deux étapes qui peuvent retenir. Deux rendus, ce serait
 * deux vocabulaires pour un seul verdict: `canGenerateMisses`.
 */
function MissingCard({ missing }: { missing: readonly FunnelMissId[] }) {
  return (
    <Card tone="dashed">
      <SectionLabel>{t("setup.missing.title")}</SectionLabel>
      <ul className="mt-2 space-y-1">
        {missing.map((miss) => (
          <li key={miss} className="text-sm leading-6 text-ink">
            {t(setupMissKey(miss))}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// L'ALLERGIE — la seule des trois natures que l'entonnoir collecte
// ───────────────────────────────────────────────────────────────────────────

function AllergyPicker({
  label,
  hint,
  idPrefix,
  allergies,
  none,
  onChange,
}: {
  label: string;
  hint: string;
  idPrefix: string;
  allergies: string[];
  none: boolean;
  onChange: (allergies: string[], none: boolean) => void;
}) {
  const [free, setFree] = React.useState("");
  return (
    <Field label={label} hint={hint}>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {ALLERGEN_OPTIONS.map((option) => {
            const on = allergies.includes(option.slug);
            return (
              <Button
                key={option.slug}
                size="sm"
                variant={on ? "primary" : "secondary"}
                onClick={() =>
                  onChange(
                    on
                      ? allergies.filter((a) => a !== option.slug)
                      : [...allergies, option.slug],
                    // Cocher un allergène VAUT réponse: « rien à déclarer »
                    // devient faux tout seul, sinon les deux coexisteraient et
                    // l'écran raconterait deux choses.
                    on ? none : false,
                  )}
              >
                {allergenLabel(option.slug)}
              </Button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={`${idPrefix}-allergy-other`}
            type="text"
            placeholder={t("setup.people.allergies_other")}
            value={free}
            onChange={(e) => setFree(e.target.value)}
            className={`${inputClass} min-w-0 flex-1`}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!free.trim()}
            onClick={() => {
              onChange([...allergies, free.trim()], false);
              setFree("");
            }}
          >
            {t("setup.people.allergies_add")}
          </Button>
        </div>
        {/* « AUCUNE » EST UNE RÉPONSE, ET ELLE S'ENREGISTRE. Sans elle, une
            table vide ne distingue pas « rien à déclarer » de « on n'a jamais
            demandé » — et sur une question de sécurité, ces deux-là ne sont pas
            la même chose. */}
        <label className="flex items-start gap-2 text-sm leading-6 text-ink">
          {/* ── `accent-fig-700`, ET LES DEUX CLASSES QU'IL REMPLACE ÉTAIENT
              MORTES ────────────────────────────────────────────────────────
              La case portait `border-gray-300 text-gray-900 focus:ring-gray-900`.
              Ce dépôt n'a PAS `@tailwindcss/forms` (vérifié dans
              `frontend/package.json`): sur une case native, `border-*` et
              `text-*` ne rendent rien du tout — la coche restait au bleu du
              système, et le gris n'était même pas appliqué. `accent-color` est
              le seul levier qui la teigne, et c'est l'idiome déjà en place sur
              `/start` (`StartPage.tsx:669`) et `/auth` (`Auth.tsx:1312`), les
              deux portes qui précèdent cet écran.
              L'anneau de focus est explicite parce que la règle
              `:focus-visible` de `tokens.css` ne couvre que `a`, `button` et
              `[tabindex]` — une case n'en fait pas partie. */}
          <input
            type="checkbox"
            checked={none}
            onChange={(e) => onChange(e.target.checked ? [] : allergies, e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-fig-700 focus:outline-none focus:ring-2 focus:ring-fig-600 focus:ring-offset-2"
          />
          <span>{t("setup.people.allergies_none")}</span>
        </label>
      </div>
    </Field>
  );
}
