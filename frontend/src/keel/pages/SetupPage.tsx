import React from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { ALLERGEN_OPTIONS } from "../copy/allergens";
import { edgeRefusalKey } from "../copy/planRefusals";
import { setupMissKey } from "../copy/setupMisses";
import { KeelAppShell } from "../components/KeelAppShell";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";
import {
  addHouseholdMember,
  createHousehold,
  generateHouseholdMeal,
  inviteToHousehold,
  MEMBER_GENDERS,
  type MemberGender,
  MEMBER_GOALS,
  type MemberGoal,
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
  DEFAULT_HOUSEHOLD_NAME,
  type FunnelBranch,
  type FunnelFacts,
  type FunnelMouth,
  type FunnelPlanAnswers,
  type FunnelState,
  funnelSteps,
  HOUSEHOLD_MAX_MOUTHS,
  nextIncomplete,
  readFunnelFacts,
  saveMouthAllergies,
  saveOwnAllergies,
  saveOwnGoal,
  saveOwnProfile,
  savePlanAnswers,
} from "../api/onboarding";
import { browserLocalDate } from "../lib/useMealTicks";
import { t } from "../i18n/t";

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
  gender: MemberGender | "";
  goal: MemberGoal | "";
  allergies: string[];
  /** « Rien à déclarer » — une RÉPONSE, pas une absence de réponse. */
  allergiesNone: boolean;
}

/** Le brouillon d'une bouche qu'on ajoute. */
interface MouthDraft {
  firstName: string;
  kind: "adult" | "child";
  birthDate: string;
  goal: MemberGoal | "";
  allergies: string[];
  allergiesNone: boolean;
}

function emptyMouthDraft(): MouthDraft {
  return {
    firstName: "",
    kind: "adult",
    birthDate: "",
    goal: "",
    allergies: [],
    allergiesNone: false,
  };
}

const GOAL_LABELS: Record<MemberGoal, string> = {
  fat_loss: "Lose weight",
  muscle_gain: "Build muscle",
  recomposition: "Same weight, different shape",
  performance: "Train better",
  health: "Eat better",
  maintenance: "Hold what I have",
};

const OCCASION_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  snack_am: "Mid-morning",
  lunch: "Lunch",
  snack_pm: "Afternoon",
  dinner: "Dinner",
  before_bed: "Before bed",
};

const DAY_LABELS: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

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
            gender: read.state.self.gender ?? "",
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
      <KeelAppShell variant="student" title={t("setup.title")}>
        <p className="text-sm text-gray-500">{t("setup.loading")}</p>
      </KeelAppShell>
    );
  }

  if (state.kind === "error") {
    return (
      <KeelAppShell variant="student" title={t("setup.title")}>
        <Card tone="warning">
          <p className="text-sm text-gray-900">{t("setup.error.title")}</p>
          <p className="mt-1 text-xs text-gray-600">{state.message}</p>
        </Card>
      </KeelAppShell>
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
      if (draft.birthDate) {
        const answer = birthDateAnswer(draft.birthDate, browserLocalDate());
        if (!answer) throw new Error(t("setup.people.birth_date_error"));
        const written = await setOwnBirthDate(userId, answer.date);
        if (!written.ok) throw new Error(t("setup.people.birth_date_error"));
      }
      if (draft.goal) await saveOwnGoal(userId, draft.goal);
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
      let birth: string | null = null;
      if (draft.birthDate) {
        const answer = birthDateAnswer(draft.birthDate, browserLocalDate());
        if (!answer) throw new Error(t("setup.people.birth_date_error"));
        birth = answer.date;
      }
      const result = await addHouseholdMember(
        name,
        birth,
        // UN MINEUR N'A JAMAIS D'OBJECTIF INDIVIDUEL. La ceinture est en base
        // et dans `goalApplies`; ne pas l'envoyer d'ici évite d'écrire une
        // valeur que le moteur refusera d'appliquer et que l'écran afficherait
        // pourtant comme active.
        draft.kind === "adult" && draft.goal ? draft.goal : null,
      );
      if (!result.ok) throw new Error(result.reason);
      const memberId = String(result.member_id ?? "");
      // ⚠️ L'ACCUSÉ EST ÉCRIT MÊME QUAND LA LISTE EST VIDE. « Aucune » est une
      // réponse: sans elle, la reprise relit « jamais demandé » et l'entonnoir
      // se bloque sur une question à laquelle la ligne n'offre pas de champ.
      await saveMouthAllergies({
        userId,
        memberId,
        labels: draft.allergies,
        current: facts!.practicalConstraints,
      });
      setMouth(emptyMouthDraft());
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
    <KeelAppShell
      variant="student"
      title={t("setup.title")}
      subtitle={t("setup.subtitle")}
    >
      <div className="space-y-6">
        {/* UN FIL DE PROGRESSION HONNÊTE: le compte réel des étapes de CETTE
            branche, pas une barre décorative. */}
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {t("setup.progress", { n: stepIndex + 1, total: steps.length })}
        </p>

        {failure ? (
          <Card tone="warning">
            <p className="text-sm text-gray-900">{failure}</p>
          </Card>
        ) : null}
        {flash ? <p className="text-xs text-gray-500">{flash}</p> : null}

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
              ── L'ORDRE EST UNE CONTRAINTE, PAS UNE PRÉFÉRENCE ──────────────
              L'accusé « on a demandé les allergies » se fusionne dans
              `student_goals.practical_constraints` DU MAÎTRE, et cette ligne
              n'existe qu'une fois sa direction posée. Mesuré au navigateur le
              2026-08-12: ajouter des bouches avant ça créait bien les lignes,
              puis échouait sur l'accusé — donc trois bouches en base dont la
              question de sécurité restait « jamais posée », sans moyen d'y
              répondre au rechargement.

              La copie est celle qui existe déjà, et elle est juste: la
              direction du maître est aussi ce qui permet de composer pour le
              foyer.
            */}
            {branch !== "solo" && facts.state.self.goal === null ? (
              <Card tone="dashed">
                <SectionLabel>{t("setup.mouths.title")}</SectionLabel>
                <p className="mt-2 text-sm text-gray-600">
                  {t("household.me.unlock")}
                </p>
              </Card>
            ) : null}
            {branch !== "solo" && facts.state.self.goal !== null ? (
              <MouthsStep
                mouths={facts.mouths}
                draft={mouth}
                onDraftChange={setMouth}
                onAdd={() => guard(addMouth)}
                onGoal={(m, g) => guard(() => saveMouthGoal(m, g))}
                onBirthDate={(m, d) => guard(() => saveMouthBirthDate(m, d))}
                onAllergyAnswer={(m, labels) =>
                  guard(() => saveMouthAllergyAnswer(m, labels))}
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
          </>
        ) : null}

        {step.id === "plan" ? (
          <PlanStep draft={plan} onChange={setPlan} missing={missing} />
        ) : null}

        {/* LA BARRE D'ACTION. « Skip for now » est visible à CHAQUE étape:
            personne n'est retenu dans un couloir, et ce qui a déjà été
            enregistré l'est vraiment. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate("/app/today")}
            disabled={busy}
          >
            {t("setup.skip")}
          </Button>
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
        <p className="text-xs text-gray-500">{t("setup.skip_hint")}</p>
      </div>
    </KeelAppShell>
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
        <p className="mt-2 text-sm text-gray-600">{t("setup.situate.member")}</p>
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
      <p className="mt-2 text-sm text-gray-600">{t("setup.situate.hint")}</p>
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
              onClick={() => onChoose(option.mouths)}
              className={[
                "rounded-xl border p-4 text-left transition-colors",
                chosen ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white",
                locked ? "cursor-not-allowed opacity-50" : "hover:bg-gray-50",
              ].join(" ")}
            >
              <span className="block text-sm font-medium text-gray-900">
                {option.title}
              </span>
              {/* `min-w-0` n'est pas nécessaire ici (pas de flex), mais le texte
                  doit se replier à 320 px: pas de `whitespace-nowrap`. */}
              <span className="mt-1 block text-xs leading-5 text-gray-600">
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
      <p className="mt-2 text-sm text-gray-600">{t("setup.people.intro")}</p>

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
                {GOAL_LABELS[g]}
              </option>
            ))}
          </select>
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
      <p className="mt-2 text-sm text-gray-600">{t("setup.mouths.intro")}</p>

      {props.mouths.length > 0 ? (
        <ul className="mt-4 divide-y divide-gray-100">
          {props.mouths.map((m) => (
            <li key={m.memberId ?? m.firstName} className="py-3">
              <MouthRow
                mouth={m}
                onGoal={(goal) => props.onGoal(m, goal)}
                onBirthDate={(date) => props.onBirthDate(m, date)}
                onAllergyAnswer={(labels) => props.onAllergyAnswer(m, labels)}
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
        <p className="mt-4 text-xs text-gray-500">{t("setup.mouths.full")}</p>
      ) : (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
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

          {draft.kind === "adult" ? (
            <Field label={t("setup.mouths.goal")} htmlFor="setup-mouth-goal">
              <select
                id="setup-mouth-goal"
                value={draft.goal}
                onChange={(e) => set({ goal: e.target.value as MemberGoal })}
                className={inputClass}
              >
                <option value="">{t("setup.mouths.goal_none")}</option>
                {MEMBER_GOALS.map((g) => (
                  <option key={g} value={g}>
                    {GOAL_LABELS[g]}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

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
  const onFile = m.birthDate === BIRTH_DATE_ON_FILE;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-gray-900">
          {m.firstName || "—"}
        </span>
        <span className="text-xs text-gray-500">
          {m.kind === "child" ? t("setup.mouths.kind_child") : t("setup.mouths.kind_adult")}
        </span>
      </div>

      {/* LA DATE NE SE PRÉREMPLIT PAS, ET C'EST LA BASE QUI LE DÉCIDE: le
          roster NE REND JAMAIS la date d'une bouche (le foyer doit savoir qu'il
          y a un enfant à table, pas son âge). On sait seulement qu'elle EXISTE,
          parce que l'âge n'est plus `unknown`. */}
      {onFile ? (
        <p className="text-xs text-gray-500">{t("household.member.birth_date_kept")}</p>
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

      {m.kind === "adult" ? (
        m.claimed ? (
          // ⚠️ D1 DU CHANTIER FOYER: dès qu'une bouche a un compte, son objectif
          // vit dans SON « about you ». Le champ n'est donc pas ici — et le dire
          // évite qu'on cherche un réglage qui n'existe plus à cet endroit.
          <p className="text-xs text-gray-500">{t("setup.mouths.goal_from_profile")}</p>
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
              {MEMBER_GOALS.map((g) => (
                <option key={g} value={g}>
                  {GOAL_LABELS[g]}
                </option>
              ))}
            </select>
          </Field>
        )
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
          <Button variant="ghost" size="sm" onClick={props.onInviteOpen}>
            {t("setup.access.title")}
          </Button>
          {props.inviteOpen ? (
            <div className="mt-2 space-y-2 rounded-lg bg-gray-50 p-3">
              <p className="text-xs leading-5 text-gray-600">
                {t("setup.access.waiting")}
              </p>
              <p className="text-xs leading-5 text-gray-600">
                {t("setup.access.grants")}
              </p>
              <p className="text-xs leading-5 text-gray-600">
                {t("setup.access.goal_carries")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  placeholder={t("setup.access.email")}
                  value={props.inviteEmail}
                  onChange={(e) => props.onInviteEmail(e.target.value)}
                  className={`${inputClass} min-w-0 flex-1`}
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
                  <p className="text-xs text-gray-600">
                    {t("household.invite.link_ready", { name: props.invite.firstName })}
                  </p>
                  {/* LE LIEN EST RENDU, PAS ENVOYÉ. En local, aucun e-mail ne
                      part — et l'écran doit donc donner de quoi le
                      transmettre à la main. */}
                  <code className="block break-all rounded bg-white p-2 text-[0.6875rem] text-gray-700">
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
  missing: readonly string[];
}) {
  const toggle = (list: readonly string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <>
      <Card>
        <SectionLabel>{t("setup.plan.title")}</SectionLabel>
        <p className="mt-2 text-sm text-gray-600">{t("setup.plan.intro")}</p>

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
                  {OCCASION_LABELS[slot] ?? slot}
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
                  {DAY_LABELS[day] ?? day}
                </Button>
              ))}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("setup.plan.time")} htmlFor="setup-time">
              <input
                id="setup-time"
                type="number"
                inputMode="numeric"
                min={5}
                max={240}
                value={draft.cookingTimeMin === null ? "" : String(draft.cookingTimeMin)}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  onChange((prev) =>
                    prev === null ? prev : {
                      ...prev,
                      cookingTimeMin: Number.isFinite(value) && value > 0 ? value : null,
                    });
                }}
                className={inputClass}
              />
            </Field>
            <Field label={t("setup.plan.budget")} htmlFor="setup-budget">
              <select
                id="setup-budget"
                value={draft.budgetBand ?? ""}
                onChange={(e) =>
                  onChange((prev) =>
                    prev === null ? prev : {
                      ...prev,
                      budgetBand: (e.target.value || null) as FunnelPlanAnswers["budgetBand"],
                    })}
                className={inputClass}
              >
                <option value="">—</option>
                <option value="tight">{t("setup.plan.budget_tight")}</option>
                <option value="normal">{t("setup.plan.budget_normal")}</option>
                <option value="comfortable">{t("setup.plan.budget_comfortable")}</option>
              </select>
            </Field>
          </div>
        </div>
      </Card>

      {/* CE QUI MANQUE, DIT PAR SON MOTIF. Un bouton gris sans explication est
          la moitié d'un refus — et le motif de D1 dit ce que l'absence COÛTE,
          pas seulement qu'un champ est vide. */}
      {missing.length > 0 ? (
        <Card tone="dashed">
          <SectionLabel>{t("setup.missing.title")}</SectionLabel>
          <ul className="mt-2 space-y-1">
            {missing.map((miss) => (
              <li key={miss} className="text-sm leading-6 text-gray-700">
                {t(setupMissKey(miss as Parameters<typeof setupMissKey>[0]))}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <p className="text-xs text-gray-500">{t("setup.plan.compose_hint")}</p>
      )}
    </>
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
                {option.label}
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
        <label className="flex items-start gap-2 text-sm leading-6 text-gray-600">
          <input
            type="checkbox"
            checked={none}
            onChange={(e) => onChange(e.target.checked ? [] : allergies, e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
          />
          <span>{t("setup.people.allergies_none")}</span>
        </label>
      </div>
    </Field>
  );
}
