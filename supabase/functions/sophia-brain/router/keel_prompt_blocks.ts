// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LE COMPOSEUR REÇOIT D'UN ÉLÈVE KEEL — `plan_question` ET LES BLOCS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `run.ts` (découpage des gros fichiers,
// lot 5a). Aucune logique changée. `run.ts` ré-exporte tout ce qui est
// exporté ici : les appelants et les tests continuent d'importer depuis lui.
// Ce module n'importe jamais `run.ts`.
//
// Ce qui est ici : le runtime de `plan_question` (MAILLON 4 :
// `loadPlanQuestionRuntime`, `writePlanQuestionChangeRequest`), le texte
// d'avarie `keelOutageTemplate` et `withKeelDoctrineBlock`, le point
// d'injection unique des blocs KEEL dans le contexte du composeur.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { KeelPlanContext } from "../context/keel_plan_context.ts";
import { isFrenchLocale } from "../../_shared/keel/locale.ts";
import type { PlanQuestionSkillRuntime } from "../skills/plan_question/skill.ts";
import type {
  PlanQuestionChangeRequest,
  PlanQuestionCommitment,
} from "../skills/plan_question/contract.ts";
// R5 frontier: `swap_policy` vit dans `plan_commitments.content` jsonb et n'est
// extrait QUE par cette fonction (evaluate-adherence-v1). Tier 0 et
// l'évaluateur lisent donc la MÊME politique — la parité « oui aujourd'hui /
// met ce soir » que `plan_question/contract.ts` pose en invariant ne peut pas
// dériver par deux copies de l'extracteur.
import { extractSwapPolicy } from "../../evaluate-adherence-v1/snapshot.ts";
import {
  loadStudentSafetyConstraints,
  safetyConstraintsPromptBlock,
  type StudentSafetyConstraint,
} from "../../_shared/keel/safety_constraints.ts";
import { coachNotePromptBlock } from "../../_shared/keel/coach_note.ts";
import { doctrineBlockFor } from "../../_shared/keel/doctrine_loader.ts";
import { protocolChatBlockFor } from "../../_shared/keel/protocol_loader.ts";
import { weekReviewPromptBlock } from "../../_shared/keel/week_review.ts";
import { pulseContextBlock } from "../../_shared/keel/daily_pulse.ts";
import { groundedSupportBlock } from "../../_shared/keel/grounded_support.ts";
import { householdContextBlock } from "../../_shared/keel/household_turn_context.ts";
import {
  householdAllergyPromptBlock,
  NO_HOUSEHOLD_SAFETY,
} from "../../_shared/keel/household_safety.ts";
import { CLINICAL_DEFERRAL_BLOCK } from "../../_shared/keel/medical_condition_floor.ts";
import type { KeelTurnContext } from "./keel_turn_context.ts";

// ===========================================================================
// W4.7 — MAILLON 4: le runtime de `plan_question`
//
// Le skill REFUSE de tourner sans ce canal (`runtimeOf` throw): une permission
// accordée sur une prescription non lue est pire que pas de lane du tout — un
// « oui » que l'évaluateur note `missed` à 23:59 punit un élève qui a suivi la
// réponse de Sophia. Tout ce qui décide (commitment, `swap_policy`,
// contraintes de sécurité) est donc lu EN BASE ici, jamais dans le turn_frame
// écrit par le LLM du dispatcher.
// ===========================================================================

const PLAN_QUESTION_COMMITMENT_COLUMNS =
  "id, title, slot_key, food_group_ref, autonomy, content, plan_version_id";

/**
 * Quelle ligne du plan la question vise ? Déterministe, et par ordre de
 * PREUVE décroissante. Aucune étape ne devine: si rien ne tranche, on rend
 * null et le résolveur escalade en `commitment_not_identified` — escalader
 * vers le coach est un résultat correct, deviner ne l'est pas.
 */
export function resolvePlanQuestionCommitmentId(args: {
  planContext: KeelPlanContext | null;
  prescribedFoodGroup: string | null;
  slotHint: string | null;
}): string | null {
  const lines = [
    ...(args.planContext?.today ?? []),
    ...(args.planContext?.week ?? []),
  ];
  if (lines.length === 0) return null;
  const prescribed = String(args.prescribedFoodGroup ?? "").trim();
  if (prescribed) {
    const byGroup = lines.filter((line) => line.food_group_ref === prescribed);
    if (byGroup.length === 1) return byGroup[0].commitment_id;
  }
  const slot = String(args.slotHint ?? "").trim();
  if (slot) {
    const bySlot = lines.filter((line) =>
      String(line.bucket) === slot && line.food_group_ref !== null
    );
    if (bySlot.length === 1) return bySlot[0].commitment_id;
  }
  const withFoodGroup = lines.filter((line) => line.food_group_ref !== null);
  return withFoodGroup.length === 1 ? withFoodGroup[0].commitment_id : null;
}

async function loadPlanQuestionRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  keel: KeelTurnContext;
  prescribedFoodGroup: string | null;
  slotHint: string | null;
}): Promise<PlanQuestionSkillRuntime> {
  const commitmentId = resolvePlanQuestionCommitmentId({
    planContext: args.keel.plan_context,
    prescribedFoodGroup: args.prescribedFoodGroup,
    slotHint: args.slotHint,
  });

  let commitment: PlanQuestionCommitment | null = null;
  if (commitmentId) {
    const { data, error } = await args.supabase
      .from("plan_commitments")
      .select(PLAN_QUESTION_COMMITMENT_COLUMNS)
      .eq("user_id", args.userId)
      .eq("id", commitmentId)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? null) as Record<string, unknown> | null;
    if (row) {
      commitment = {
        id: String(row.id ?? ""),
        title: String(row.title ?? ""),
        slot_key: row.slot_key === null || row.slot_key === undefined
          ? null
          : String(row.slot_key),
        food_group_ref:
          row.food_group_ref === null || row.food_group_ref === undefined
            ? null
            : String(row.food_group_ref),
        autonomy: String(row.autonomy ?? "strict") as
          PlanQuestionCommitment["autonomy"],
        swap_policy: extractSwapPolicy(row.content),
        plan_version_id:
          row.plan_version_id === null || row.plan_version_id === undefined
            ? null
            : String(row.plan_version_id),
      };
    }
  }

  const groups = await args.supabase.from("food_groups").select("slug, class");
  if (groups.error) throw groups.error;
  const foodGroupClasses: Record<string, string> = {};
  for (const raw of (groups.data ?? []) as Array<Record<string, unknown>>) {
    const slug = String(raw.slug ?? "").trim();
    const klass = String(raw.class ?? "").trim();
    if (slug && klass) foodGroupClasses[slug] = klass;
  }

  // Chargées à CHAQUE tour, hors du chemin mémoire (W3.3). Ce loader THROW sur
  // erreur, volontairement: une allergie ne peut pas être une lecture ratée.
  const safetyConstraints: StudentSafetyConstraint[] =
    await loadStudentSafetyConstraints(
      args.supabase as never,
      args.userId,
    );

  return {
    commitment,
    food_group_classes: foodGroupClasses,
    safety_constraints: safetyConstraints,
    // R2: la ligne `contract_change_requests` porte la prose de l'élève; sans
    // locale persistée on refuse d'écrire plutôt que de deviner la langue.
    content_locale: args.keel.content_locale ?? "",
  };
}

/**
 * Écrit la demande d'arbitrage du coach, WRITE-THROUGH (insert + relecture de
 * l'id). `bypasses_digest` est DÉRIVÉ, pas une colonne — l'envoyer ferait
 * 400 PostgREST et perdrait l'alerte entière; `urgency='immediate'` EST le
 * contournement du digest.
 */
async function writePlanQuestionChangeRequest(args: {
  supabase: SupabaseClient;
  changeRequest: PlanQuestionChangeRequest;
}): Promise<{ written: boolean; id: string | null; reason_code: string }> {
  const { bypasses_digest: _bypassesDigest, ...row } = args.changeRequest;
  try {
    const { data, error } = await args.supabase
      .from("contract_change_requests")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    const id = String((data as Record<string, unknown> | null)?.id ?? "")
      .trim();
    return id
      ? { written: true, id, reason_code: "raised" }
      : { written: false, id: null, reason_code: "missing_readback_row" };
  } catch (error) {
    console.error("[plan_question] change request write failed", error);
    return {
      written: false,
      id: null,
      reason_code: "change_request_write_failed",
    };
  }
}

/**
 * W12-V — texte d'AVARIE (le modèle a échoué), dans la langue de réponse.
 *
 * Exporté pour être mesurable : c'est le seul texte visible d'un tour raté, et
 * un tour raté est exactement celui qu'on ne rejoue pas pour vérifier.
 * `resolveResponseLocale` est l'unique décideur de langue (R3) ; ici on ne fait
 * que choisir la copie. La phrase dit ce qui est VRAI et rien d'autre : aucune
 * ligne n'a été écrite — même contrat que la ceinture accusé-fantôme.
 */
export function keelOutageTemplate(locale: string): string {
  // `locale` est REQUIS. Il était optionnel, avec un repli
  // `resolveResponseLocale({})`, et l'unique appelant de production ne le
  // passait pas: le texte d'avarie sortait donc toujours en anglais, y compris
  // sur un fil français. Un paramètre optionnel ici, c'est la langue décidée
  // par l'oubli de l'appelant.
  const tag = locale;
  return isFrenchLocale(tag)
    ? "J'ai un souci technique sur ce tour. Je n'ai rien execute de plus."
    : "I hit a technical problem on this turn. Nothing was logged.";
}

/**
 * PIVOT §3.3 — INJECTION de la couche `[DOCTRINE COACH]` dans le composeur.
 *
 * L'autre moitié du double verrou: `applyKeelOutputLocks` VÉRIFIE la sortie,
 * ceci FAIT la voix. Sans cette injection le verrou est un videur devant une
 * salle vide — il empêche l'agent de contredire le coach, il ne le fait pas
 * parler comme lui, et « c'est MON agent » (§1.4) n'existe pas.
 *
 * POURQUOI EN TÊTE DU CONTEXTE, et pas ailleurs:
 *   - `applyCompanionPromptBudgetWithPinnedContext` **tronque par la QUEUE**
 *     (note explicite dans `companion.ts`). Un bloc ajouté en fin de contexte
 *     disparaît donc silencieusement sur les tours les plus riches — ceux où
 *     la doctrine compte le plus. En tête, il survit à la troncature.
 *   - la couche `[DOCTRINE COACH]` de §3.3 est censée précéder le protocole et
 *     la mémoire de l'élève: l'ordre du contexte reproduit celui du contrat.
 *
 * LIMITE CONNUE, assumée et notée dans STATUS-MORNING: §3.3 veut ce bloc dans
 * le PRÉFIXE MIS EN CACHE (tier semi-stable de `buildCompanionPromptParts`),
 * pas dans le contexte volatile. Le placer correctement demande de faire
 * traverser le contexte KEEL à `agent_exec` puis à `runCompanion` — trois
 * signatures sur le chemin de TOUTE conversation. Le comportement produit est
 * ici correct; l'économie de cache ne l'est pas encore. `compileDoctrineBlock`
 * expose déjà le hash nécessaire le jour où on déplacera le bloc.
 *
 * HORS ÉLÈVE KEEL: rendu tel quel. La branche FR legacy n'est pas touchée.
 */
// ⚠️ LE NOM MENT D'UN TIERS, ET C'EST DÉLIBÉRÉ DE NE PAS LE RENOMMER: cette
// fonction injecte TROIS blocs, dans cet ordre — contraintes dures, doctrine,
// note 1:1 du coach (2026-08-05). Elle reste « le » point d'injection unique,
// ce que quatre commentaires ailleurs dans le repo désignent par ce nom.
export function withKeelDoctrineBlock(
  context: string,
  keel: KeelTurnContext,
): string {
  if (!keel.is_student) return context;
  const blocks: string[] = [];

  // PIVOT §3.3 — LA MOITIÉ « AVANT GÉNÉRATION » DU VERROU MÉDICAL, et elle
  // manquait entièrement (QA agent 4, 2026-08-03).
  //
  // Elle passe AVANT la doctrine, délibérément, pour la raison exacte donnée
  // ci-dessus sur l'ordre: le budget de prompt tronque PAR LA QUEUE. Sur un
  // tour riche — celui où l'agent a le plus de matière pour proposer à manger,
  // donc celui où l'allergène risque le plus de sortir — c'est le dernier bloc
  // qui saute. Mettre la contrainte dure derrière la doctrine reviendrait à la
  // faire disparaître précisément quand elle compte.
  //
  // `safety_constraints === null` (lecture en panne) ne produit AUCUN bloc,
  // et c'est la bonne posture: on n'écrit pas « aucune contrainte » quand on
  // ne sait pas. La distinction null / [] est préservée jusqu'ici.
  // LE VERROU MÉDICAL EN PREMIER — avant même les contraintes dures.
  //
  // Le budget de prompt tronque PAR LA QUEUE, et l'ordre de ces blocs est donc
  // un classement par coût de perte. Perdre l'allergène met un aliment dans une
  // assiette; perdre celui-ci sert un protocole nutritionnel à quelqu'un dont
  // la maladie se soigne. Et il gouverne la POSTURE du tour entier, pas un
  // ingrédient: il passe donc devant.
  if (keel.declared_medical_condition) blocks.push(CLINICAL_DEFERRAL_BLOCK);

  // `null` = UNE SEULE BOUCHE, dit explicitement (paramètre REQUIS, jamais
  // optionnel). `keel.safety_constraints` est la table du LOCUTEUR seul: c'est
  // par construction une seule bouche, et son titre le dit déjà. Les
  // contraintes des AUTRES bouches de son foyer arrivent par leur propre bloc,
  // juste en dessous — `householdAllergyPromptBlock`, qui a sa propre politique
  // d'attribution (il refuse de nommer, exprès: dire à quelqu'un qu'IL est
  // allergique quand c'est son enfant est un fait faux sur une personne).
  const safetyBlock = safetyConstraintsPromptBlock(keel.safety_constraints, null);
  if (safetyBlock && safetyBlock.trim()) blocks.push(safetyBlock);

  // LES CONTRAINTES DURES DU FOYER, JUSTE DERRIÈRE CELLES DU LOCUTEUR.
  //
  // Même rang de survie qu'elles — l'ordre de ces blocs est un classement par
  // COÛT DE PERTE et le budget tronque par la queue: perdre celui-ci met un
  // allergène dans une assiette, et dans celle d'un enfant qui ne pouvait pas
  // le déclarer lui-même. Il ne peut donc pas descendre sous la doctrine.
  //
  // ⚠️ ET IL N'EST PAS DANS LE BLOC « WHAT THIS HOUSEHOLD IS EATING », qui
  // porte, lui, un plafond de caractères et un ordre de coupe. Une allergie
  // n'a pas de rang acceptable dans une file d'attente: elle est hors de la
  // file. C'est ce qui la rend insensible à un foyer de huit avec sept jours
  // de préparations.
  //
  // DEUX ÉTATS, UN SEUL BLOC À LA FOIS: l'union du foyer quand la lecture a
  // abouti, la dégradation nommée quand elle a échoué. « Aucune allergie » ne
  // pousse RIEN — pas de bloc vide, donc rien du tout chez quelqu'un qui n'a
  // pas de foyer.
  //
  // Le `??` n'est PAS un repli de garde: le champ est OBLIGATOIRE sur
  // `KeelTurnContext`, et les deux seuls producteurs de production
  // (`loadKeelTurnContext` et `LEGACY_KEEL_TURN_CONTEXT`) le posent tous les
  // deux, vérifié par `deno check`. Il protège du seul cas restant — un décor
  // de test écrit à la main avant ce lot — parce qu'un `TypeError` ici casse
  // TOUTES les conversations, ce qui est un prix absurde pour une fixture.
  const householdSafetyBlock = householdAllergyPromptBlock(
    keel.household_safety ?? NO_HOUSEHOLD_SAFETY,
  );
  if (householdSafetyBlock) blocks.push(householdSafetyBlock);

  const doctrine = keel.doctrine ? doctrineBlockFor(keel.doctrine) : null;
  if (doctrine && doctrine.trim()) blocks.push(doctrine);

  // FF-016 — LES ALIMENTS QUE LE COACH MET EN AVANT, JUSTE APRÈS LA DOCTRINE.
  //
  // ── POURQUOI CE RANG, ET PAS UN AUTRE ──────────────────────────────────
  // Deux raisons, et la première est un contrat:
  //
  //  1. §3.3 range la couche `[DOCTRINE COACH]` AVANT le protocole et la
  //     mémoire de l'élève (c'est écrit dans l'en-tête de cette fonction).
  //     L'ordre du contexte reproduit l'ordre du contrat, ici comme ailleurs.
  //  2. L'ordre de ces blocs est un classement par COÛT DE PERTE, parce que le
  //     budget tronque par la queue. Perdre ce bloc, c'est le chat qui
  //     recommande ce que la méthode déconseille pendant que le générateur,
  //     lui, l'évite: l'app se contredit elle-même, et c'est l'incohérence la
  //     plus visible qu'un élève puisse rencontrer. Ça coûte plus cher que la
  //     note 1:1 (un service dégradé d'un cran) et moins cher que la doctrine
  //     (l'agent devient générique) — donc juste entre les deux.
  //
  // ⚠️ IL PASSE APRÈS `safetyConstraintsPromptBlock`, ET C'EST STRUCTUREL.
  // Un `excluded` de coach et une allergie ne sont pas le même registre; le
  // bloc le dit lui-même en toutes lettres. Le remonter au-dessus des
  // contraintes dures apprendrait au modèle à traiter une aversion de méthode
  // comme un risque vital — ou, ce qui est pire, l'inverse.
  //
  // ABSENT ⇒ AUCUN BLOC. Pas de « ton coach n'a pas de méthode alimentaire »:
  // c'est la doctrine qui porte « il n'a pas tranché » (SILENCE IS NOT A
  // POSITION), et le dire deux fois dans deux vocabulaires est exactement
  // comment un modèle finit par choisir la formulation la plus flatteuse.
  //
  // LE NOM DU COACH VIENT DE LA DOCTRINE, pas d'une seconde lecture de
  // `coaches`: une deuxième source pour le même nom, c'est un prompt qui
  // nomme la même personne de deux façons dans deux blocs voisins.
  const protocolBlock = keel.protocol
    ? protocolChatBlockFor(keel.protocol, keel.doctrine?.coachDisplayName ?? null)
    : "";
  if (protocolBlock.trim()) {
    blocks.push(protocolBlock);
    // La PREUVE d'injection. Le texte du prompt n'est stocké nulle part, donc
    // « le bloc est-il parti ? » ne se répond que par un log — et une mesure de
    // budget qu'on ne peut pas relire est une mesure qu'on n'a pas faite.
    try {
      console.info("keel.protocol.chat_block", {
        reason: keel.protocol?.reason ?? null,
        rules_kept: keel.protocol?.compiled.length ?? 0,
        block_chars: protocolBlock.length,
      });
    } catch {
      // non bloquant
    }
  }

  // FF-010 — CE QUE LE FOYER MANGE, s'il y en a un.
  //
  // ⚠️ IL SE NOMME DISTINCTEMENT DU BLOC PLAN DU COACH, et ce n'est pas de la
  // typographie: `keel_plan_context.ts` porte la règle — « two plan blocks in
  // one prompt is how a model gets to pick the more flattering one ». Les
  // ENGAGEMENTS du coach et les PLATS du foyer sont deux couches différentes.
  // Le titre de celui-ci dit « what this household is eating », jamais « the
  // plan », et sa première phrase interdit explicitement de les confondre.
  //
  // ── SON RANG DANS L'ORDRE DE SURVIE, ET POURQUOI IL A MONTÉ ───────────────
  // L'ordre de ces blocs est un classement par COÛT DE PERTE, parce que le
  // budget tronque par la queue. Il était AVANT-DERNIER (entre le pouls et le
  // soutien groundé); il est maintenant CINQUIÈME, juste après le protocole du
  // coach et avant la note 1:1.
  //
  // La raison est le coût, pas la nouveauté: perdre ce bloc ne dégrade pas la
  // réponse d'un cran, il fait CUISINER LE MAUVAIS PLAT. Mesuré sans lui, sur
  // « What do I need to buy? »: l'agent fabrique une liste de courses à partir
  // des titres de plats. Le classement se lit donc: verrou clinique >
  // allergène > doctrine > protocole > CE QUE LE FOYER MANGE > note du coach >
  // bilan hebdo > pouls > soutien. Il reste sous les quatre premiers — une
  // allergie qui saute met un aliment dans une assiette, ce qui coûte plus
  // qu'un dîner faux.
  //
  // ABSENT ⇒ AUCUN BLOC (R8): pas de « ton foyer n'a rien prévu » à quelqu'un
  // qui vit seul.
  const householdBlock = keel.household
    ? householdContextBlock(keel.household)
    : null;
  if (householdBlock && householdBlock.trim()) blocks.push(householdBlock);

  // LA NOTE 1:1 DU COACH — dernière des trois, exprès, et pour la raison
  // donnée deux blocs plus haut sur l'ordre: le budget de prompt tronque PAR
  // LA QUEUE. Des trois, c'est celle dont la perte coûte le moins — un
  // allergène qui saute est une assiette, une observation qui saute est un
  // service dégradé d'un cran.
  //
  // Absente, elle ne pousse RIEN: pas d'en-tête, pas de « le coach n'a rien
  // noté ». C'est la condition sous laquelle la note reste optionnelle
  // (`coach_note.ts`), et c'est aussi la leçon de `NO_COACH_METHOD_BLOCK`, dont
  // le titre décrivait un état interne et ressortait mot pour mot dans la
  // bouche de l'agent.
  const coachNote = keel.coach_note ? coachNotePromptBlock(keel.coach_note) : null;
  if (coachNote && coachNote.trim()) blocks.push(coachNote);

  // LE BILAN DE LA DERNIÈRE SEMAINE EXAMINÉE — DERNIER DES CINQ, exprès.
  //
  // L'ordre de ces blocs est un classement par COÛT DE PERTE, parce que le
  // budget de prompt tronque par la queue. Perdre le verrou clinique sert un
  // protocole à quelqu'un dont la maladie se soigne; perdre l'allergène met un
  // aliment dans une assiette; perdre la doctrine rend l'agent générique;
  // perdre la note du coach dégrade le service d'un cran. Perdre le bilan coûte
  // un SUJET DE CONVERSATION — le moins cher des cinq, donc le dernier.
  //
  // ⚠️ IL PORTE SES DATES, et c'est structurel, pas cosmétique: ce bloc survit
  // toute la semaine SUIVANTE, et un modèle qui dirait « cette semaine tu as vu
  // du poisson deux fois » énoncerait un chiffre exact rattaché à la mauvaise
  // période — c'est-à-dire un chiffre faux que rien ne permet de contester.
  // `weekReviewPromptBlock` écrit la plage en tête et l'interdit explicitement.
  const weekReview = keel.week_review
    ? weekReviewPromptBlock(keel.week_review.reading, keel.week_review.biofeedback)
    : null;
  if (weekReview && weekReview.trim()) blocks.push(weekReview);

  // FF-013 — CE QU'ON SAIT DÉJÀ DE SON ÉNERGIE, DE SA FAIM ET DE SON SOMMEIL.
  //
  // APRÈS le bilan hebdo, exprès: le bloc renvoie vers les six notes du
  // dimanche (« elles sont plus haut »), donc il doit les suivre. Et il est le
  // moins cher des six à perdre par la queue — son absence rouvre une question
  // de trop, pas une assiette.
  //
  // IL EST POUSSÉ MÊME SANS TAP, et c'est délibéré: sans matière, sa moitié
  // utile est l'INTERDICTION de demander, qui est justement ce qui compte le
  // plus quand l'agent ne sait rien. Le bloc ne dit jamais « il n'a rien
  // tapé » — il dit qu'on ne sait pas, et qu'un silence n'est pas une bonne
  // journée.
  //
  // Sous plancher de restriction, `daily_pulse` vaut déjà `null` (filtré au
  // CHARGEMENT), donc ce bloc ne porte que son interdiction. Rien à ne pas
  // dire, parce que rien n'est là.
  const pulseBlock = pulseContextBlock(
    keel.daily_pulse,
    Boolean(keel.week_review?.biofeedback),
  );
  if (pulseBlock.trim()) blocks.push(pulseBlock);

  // FF-011 — LE SOUTIEN EST GROUNDÉ OU IL EST COURT.
  //
  // DERNIER des sept, et donc le premier à sauter par la queue. C'est le bon
  // rang: sa perte laisse l'agent sans la matière du jour, mais la CEINTURE,
  // elle, est déterministe et vit dans `finalVisibleText` — elle ne dépend
  // d'aucun bloc de prompt. Perdre ce bloc dégrade la réponse; ça ne rouvre
  // pas la porte à l'encouragement creux.
  //
  // Sous plancher de restriction, `day_facts` vaut déjà `null` (filtré au
  // CHARGEMENT) et le bloc ne porte que sa règle de conduite.
  const supportBlock = groundedSupportBlock(keel.day_facts, keel.support_ground);
  if (supportBlock.trim()) blocks.push(supportBlock);

  if (blocks.length === 0) return context;
  const base = String(context ?? "");
  return base.trim()
    ? `${blocks.join("\n\n")}\n\n${base}`
    : blocks.join("\n\n");
}

// Exportés pour `run.ts` seulement (ils n'étaient pas exportés quand ils
// vivaient dans `run.ts`) ; `run.ts` ne les ré-exporte pas.
export { loadPlanQuestionRuntime, writePlanQuestionChangeRequest };
