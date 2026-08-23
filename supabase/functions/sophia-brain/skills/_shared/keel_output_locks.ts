/// <reference path="../../../tsserver-shims.d.ts" />

/**
 * PIVOT NUTRITION — CEINTURE DE SORTIE: les deux verrous déterministes, sur le
 * chemin de rendu de TOUS les messages visibles.
 *
 * ── LE DÉFAUT MESURÉ, ET IL EST STRUCTUREL ────────────────────────────────
 * `docs/keel/CONTRACT.md` énonce une garantie GLOBALE:
 *
 *   "A deterministic post-generation validator rejects any output containing a
 *    `severity='medical'` token."
 *
 * Vérifié dans le code le 2026-08-03: `findMedicalConstraintViolations` n'a
 * qu'UN SEUL appelant en production — `skills/plan_question/renderer.ts:115`.
 * La réponse normale, l'accusé de photo de repas, les messages proactifs et
 * tous les autres skills ne passent par AUCUN validateur. La garantie est
 * écrite comme globale et implémentée sur un chemin étroit.
 *
 * C'est le pattern adversarial §7.3-(3) dans sa forme la plus coûteuse: le
 * consommateur (le contrat, la revue de sécurité, la promesse commerciale)
 * lit une garantie que le producteur n'écrit que sur 1 chemin sur N. Personne
 * ne ment; la garantie est simplement fausse.
 *
 * Ce module la rend vraie, en la posant là où TOUT texte visible passe déjà:
 * `finalVisibleText` (router/run.ts).
 *
 * ── DEUX VERROUS, DEUX RÉACTIONS DIFFÉRENTES ──────────────────────────────
 * Ils ne protègent pas la même chose, donc ils ne réagissent pas pareil.
 *
 *   MÉDICAL (allergène `severity='medical'` suggéré à l'élève)
 *     → le message entier est REMPLACÉ. Pas de découpe de phrase: un texte
 *       amputé de sa suggestion dangereuse reste un texte qui parlait de
 *       cacahuètes à un élève anaphylactique, et le contexte résiduel
 *       ("...c'est une bonne source de protéines") peut porter la suggestion
 *       à lui seul. Le seul rendu sûr est un rendu qui ne prétend rien.
 *
 *   ⛔ S2 (2026-08-22) — STRICT (`severity='strict'`: une intolérance, une
 *   règle de maison) est vérifié PAR LE MÊME VERROU, depuis
 *   `BELT_BLOCKING_SEVERITIES` dans `safety_constraints.ts`.
 *     → le message entier est également remplacé, mais par
 *       `STRICT_BLOCK_FALLBACK_EN`, PAS par le texte médical. Servir « pose la
 *       question à un médecin » à quelqu'un qui ne digère pas le lactose est
 *       faux 100 % des fois où ça sort. Un texte qui mord les deux crans à la
 *       fois rend le repli MÉDICAL: le plus protecteur gagne.
 *     ⚠️ Ce que ça a fermé: `plan_question/allergen_bridge.ts` bloquait DÉJÀ
 *       l'échange d'un plat sur `strict`, pendant que le TEXTE qui nomme la
 *       même chose passait. Deux copies divergeaient; il n'en reste qu'une.
 *
 *   INTERDIT COACH (l'agent recommande ce que le coach proscrit)
 *     → le message entier est également remplacé, mais par un texte DIFFÉRENT
 *       qui renvoie au coach. Raison produit: une contradiction publique avec
 *       le coach détruit la seule chose qu'on lui vend. Mieux vaut un message
 *       qui défère que trois phrases qui le désavouent.
 *
 * ── POURQUOI REMPLACER ET NE PAS RÉGÉNÉRER ICI ────────────────────────────
 * `finalVisibleText` est synchrone et sans I/O — c'est ce qui rend toutes les
 * ceintures de rendu testables. La régénération (avec
 * `doctrineRetryInstruction`, qui NOMME la règle violée) appartient au
 * composeur, en amont. Cette ceinture est le filet: elle garantit qu'un défaut
 * de régénération ne devient jamais un message envoyé.
 *
 * ── DOCTRINE P9 — CONDITIONS DE DÉSARMEMENT (obligatoires, testées) ────────
 *   1. `disarmed_not_keel_student` — hors élève KEEL, il n'y a ni contrainte
 *      chargée ni coach: les deux verrous n'ont rien à comparer.
 *   2. `disarmed_no_constraints` — aucune contrainte médicale ET aucune
 *      doctrine: la ceinture ne peut pas mordre, par construction.
 *   2bis. `disarmed_constraints_unreadable` — la table des contraintes n'a PAS
 *      pu être lue (`safetyConstraints` vaut `null`/absent). Voir le bloc
 *      « CE QUE `null` VEUT DIRE » dans le corps: ce n'est pas la même chose
 *      que « rien à vérifier », et ça ne doit surtout pas se lire `clean`.
 *   3. `disarmed_negated_mention` — « évite les cacahuètes », « Marc ne fait
 *      pas de 6 petits repas »: le mécanisme de négation partagé
 *      (`forbidden_matcher.ts`) laisse passer. Sans ça, le plan d'un élève
 *      cœliaque, littéralement fait d'items « sans gluten », serait rejeté à
 *      chaque tour — et une ceinture qui rejette tous les tours légitimes est
 *      une ceinture qu'on débranche dans la semaine.
 *   4. `disarmed_empty_text` — rien à valider.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire.
 */

import {
  findMedicalConstraintViolations,
  type StudentSafetyConstraint,
} from "../../../_shared/keel/safety_constraints.ts";
import {
  type CoachDoctrine,
  findDoctrineViolations,
} from "../../../_shared/keel/doctrine.ts";

export const OUTPUT_LOCK_REASONS = [
  "clean",
  "disarmed_not_keel_student",
  "disarmed_no_constraints",
  "disarmed_constraints_unreadable",
  "disarmed_empty_text",
  "blocked_medical_constraint",
  // ⛔ S2 — LE VERDICT DU CRAN `strict`, SÉPARÉ DE CELUI DU CRAN `medical`.
  //
  // Les deux remplacent le message, mais ils ne remplacent pas par le même
  // texte et ils ne se lisent pas pareil en télémétrie: `blocked_medical_*`
  // dit « on a frôlé un événement de santé », `blocked_strict_*` dit « on a
  // frôlé une mauvaise soirée ». Les confondre rendrait l'élargissement de la
  // ceinture INVISIBLE — on ne saurait pas dire, après coup, combien de
  // blocages viennent des 6 lignes que `S2` a fait entrer.
  //
  // ⚠️ SANS EFFET SUR CE QUI PASSE. Les trois appelants de production
  // décident avec `reason === "clean" || reason.startsWith("disarmed")`
  // (`meal_generation.ts:6178`, `week_plan_generation.ts:842`, et
  // `router/run.ts` qui rend `locked.text`): un verdict neuf qui ne commence
  // ni par `clean` ni par `disarmed` se comporte exactement comme
  // `blocked_medical_constraint`, ce qui est le comportement voulu.
  "blocked_strict_constraint",
  "blocked_coach_interdit",
] as const;
export type OutputLockReason = (typeof OUTPUT_LOCK_REASONS)[number];

export interface OutputLockInput {
  text: string;
  isKeelStudent: boolean;
  /** Chargées à chaque tour, hors chemin mémoire. */
  safetyConstraints?: readonly StudentSafetyConstraint[] | null;
  /**
   * La doctrine PUBLIÉE du coach de cet élève, si elle a pu être chargée.
   *
   * `foods` fait partie du Pick parce que les aliments DÉCONSEILLÉS sont
   * vérifiés par le même verrou que les interdits: suggérer à un élève un
   * aliment que son coach ne met pas dans une assiette est la même
   * contradiction publique, avec les mêmes conséquences commerciales.
   */
  doctrine?: Pick<CoachDoctrine, "forbidden" | "foods"> | null;
  /**
   * Le nom du coach, POUR SIGNER SA SUBSTITUTION — et rien d'autre.
   *
   * Optionnel PAR CONCEPTION, et le call site décide. Le chat le passe: la
   * substitution y est un message que l'élève lit, et c'est le seul moment du
   * produit où il reçoit les mots de son coach mot pour mot. Les deux
   * générateurs (`meal_generation`, `week_plan_generation`) ne le passent PAS:
   * ils produisent un artefact — un plat, une ligne de semaine — et y coller
   * « — Marc » signerait une recette, pas une réponse.
   *
   * Son absence ne désarme aucune garde: elle retire une signature, pas une
   * vérification. C'est la seule forme sous laquelle un paramètre optionnel est
   * acceptable ici.
   */
  coachDisplayName?: string | null;
  /**
   * Les identifiants que CE TOUR retire (`declare_safety_constraint` avec
   * `intent: 'retract'`). Voir la condition de désarmement n°5 dans le corps:
   * sans elle, un élève ne peut JAMAIS corriger une contrainte, parce que la
   * réponse qui accuse la rétractation renomme forcément l'allergène et
   * redéclenche le remplacement — à chaque tentative.
   */
  retractedConstraintRefs?: readonly string[] | null;
}

export interface OutputLockResult {
  /** Le texte à envoyer. Identique à l'entrée quand rien n'a mordu. */
  text: string;
  reason: OutputLockReason;
  /** Les tokens qui ont mordu — pour le log d'incident, jamais pour l'élève. */
  tokens: string[];
}

/**
 * Le rendu de repli quand un allergène médical est nommé comme suggestion.
 *
 * Il ne s'excuse pas et n'explique pas ce qui a été retiré: dire « je ne peux
 * pas te parler de cacahuètes » NOMME l'allergène et rend l'incident visible à
 * l'élève, ce qui est à la fois anxiogène et inutile.
 *
 * ── POURQUOI IL NE RENVOIE PLUS AU COACH ────────────────────────────────
 * Il disait « let me check with your coach ». Deux défauts, et le second est
 * un défaut de sécurité:
 *   1. Le produit est une MASTERCLASSE. Il n'existe aucun canal un-à-un vers le
 *      coach: la phrase désignait une porte qui n'existe pas.
 *   2. Un coach n'est pas la bonne adresse pour une question médicale. Router
 *      une allergie ou une classe de médicament vers un coach sportif est une
 *      mauvaise orientation, quand bien même le canal existerait.
 */
export const MEDICAL_BLOCK_FALLBACK_EN =
  "I would rather not answer that one from memory - it touches something medical, and that is not mine to guess at. That is one to put to a doctor.";

/**
 * ⛔ S2 — LE SECOND REPLI, POUR LE CRAN `strict`. SANS LUI, LE LOT DÉGRADE LA
 *     CONVERSATION QU'IL PRÉTEND PROTÉGER.
 *
 * ── LE DÉFAUT QU'IL FERME, MESURÉ AVANT D'ÉCRIRE UNE LIGNE ────────────────
 * Jusqu'au 2026-08-22 la ceinture n'avait qu'UN texte de remplacement, celui
 * juste au-dessus. Il est juste pour une allergie anaphylactique. Servi à
 * quelqu'un qui a déclaré une intolérance au lactose, juste après une phrase
 * qui parlait de yaourt, il est **faux à chaque fois qu'il sort**: il n'y a
 * rien de médical à décider, aucun médecin à consulter, et la seule chose que
 * l'élève apprend est que l'agent s'est dérobé.
 *
 * Élargir la ceinture à `strict` sans ce texte-ci aurait donc fait exactement
 * ce que le dépôt appelle « une garde qui protège en cassant »: 6 contraintes
 * actives entrent sous la ceinture, et les 6 reçoivent un renvoi au médecin.
 *
 * ── CE QU'IL DIT, ET CE QU'IL REFUSE DE DIRE ─────────────────────────────
 *   · IL NE NOMME PAS LE JETON. Même raison que le repli médical: rendre
 *     l'incident visible est anxiogène et n'aide en rien. « quelque chose que
 *     tu m'as dit de garder hors de ton assiette » suffit et reste vrai.
 *   · IL N'ENVOIE NI CHEZ LE MÉDECIN NI CHEZ LE COACH. Le premier serait faux;
 *     le second désignerait une porte qui n'existe pas — il n'y a aucun canal
 *     1:1 coach → élève dans ce produit (voir CLAUDE.md).
 *   · IL DONNE UNE SORTIE. C'est la moitié qui compte, et elle vient d'une
 *     cicatrice mesurée: un dispositif qu'on ne peut pas quitter est un piège
 *     (condition de désarmement n°5, le tour de rétractation). « Redemande-moi »
 *     est une action que l'élève peut faire tout de suite, seul.
 *
 * ⚠️ CE TEXTE N'EST VU QUE DANS LA CONVERSATION. Les deux lanes de génération
 * jettent `lock.text` et ne lisent que `lock.reason` (`meal_generation.ts`,
 * `week_plan_generation.ts`): là-bas une morsure VIDE le plan. C'est pourquoi
 * `S2` corrige aussi `SEVERITY_READING_BLOCK` dans `meal_generation.ts`, qui
 * annonçait au modèle que seul un nom `severity=medical` détruit la semaine.
 *
 * ⚠️ IL EST EN ANGLAIS, COMME SON JUMEAU, ET CE N'EST PAS UN OUBLI. Les deux
 * replis sont des littéraux de ce module — il n'existe aucune couche i18n sur
 * ce chemin, et en poser une pour une seule phrase impliquerait `en.ts`/`fr.ts`,
 * interdits de commit. Ce que ça coûte est écrit dans la fiche du lot: un élève
 * francophone lit une phrase anglaise, exactement comme aujourd'hui pour le
 * repli médical. Le lot ne CRÉE pas ce défaut, il ne le répare pas non plus.
 */
export const STRICT_BLOCK_FALLBACK_EN =
  "I am not going to stand behind that one - it had something in it that you have told me to keep off your plate. Ask me again and I will work around it.";

/**
 * Le repli de doctrine quand le coach n'a pas dit ce qu'il fait À LA PLACE.
 *
 * ── POURQUOI IL NE DIT PLUS « DEMANDE À TON COACH » ─────────────────────
 * Parce que c'est exactement l'inverse de ce que le coach achète. Il nous paie
 * pour être présent en son absence — répondre À SA PLACE, dans sa méthode. Une
 * déférence systématique lui renvoie ses élèves dans un canal qui n'existe pas
 * et ne règle rien.
 *
 * Ce texte-ci est donc le DERNIER recours: il pose le cadre sans inventer de
 * porte de sortie. Le vrai repli est `instead`, écrit par le coach.
 */
export const DOCTRINE_BLOCK_FALLBACK_EN =
  "That one sits outside how your coach works, so I would rather not point you down that road.";

/**
 * Choisit le texte de remplacement quand un interdit a mordu.
 *
 * ── LE PIÈGE QUE CETTE FONCTION FERME ───────────────────────────────────
 * Le texte de substitution est écrit par le COACH et il n'a jamais été soumis
 * aux verrous — il est injecté APRÈS eux. Un `instead` du type « trois vrais
 * repas, avec du beurre de cacahuète au petit-déjeuner » servi à un élève
 * allergique à l'arachide contournerait le verrou médical par la sortie de
 * secours du verrou de doctrine.
 *
 * Le remplacement est donc RE-VÉRIFIÉ contre les contraintes dures de cet
 * élève. S'il mord, on retombe sur le texte générique — jamais sur le texte du
 * coach.
 *
 * Exportée pour être testée seule: c'est un chemin qu'un test d'ensemble ne
 * visite qu'avec le bon élève, la bonne doctrine et la bonne allergie à la fois.
 */
export function resolveDoctrineReplacement(
  violationTokens: readonly string[],
  forbidden: readonly CoachDoctrine["forbidden"][number][],
  constraints: readonly StudentSafetyConstraint[],
  coachDisplayName?: string | null,
): { text: string; usedCoachWords: boolean } {
  for (const token of violationTokens) {
    const entry = forbidden.find((f) => f.token === token);
    const instead = String(entry?.instead ?? "").trim();
    if (!instead) continue;
    if (findMedicalConstraintViolations(instead, constraints).length > 0) {
      console.error("keel.output_lock.instead_unsafe", {
        token,
        detail: "Coach's replacement names a hard constraint; fell back to generic.",
      });
      continue;
    }
    return { text: signAsCoach(instead, coachDisplayName), usedCoachWords: true };
  }
  // ⚠️ LE REPLI GÉNÉRIQUE N'EST JAMAIS SIGNÉ, et c'est la moitié qui compte.
  //
  // `DOCTRINE_BLOCK_FALLBACK_EN` est NOTRE phrase, écrite ici, quand le coach
  // n'a rien prévu ou que son texte mordait une contrainte médicale. La signer
  // ferait dire au coach une chose qu'il n'a pas écrite — au moment précis où
  // l'élève pousse contre sa méthode, c'est-à-dire au pire moment possible pour
  // lui prêter des mots. La signature suit `usedCoachWords`, jamais autre chose.
  return { text: DOCTRINE_BLOCK_FALLBACK_EN, usedCoachWords: false };
}

/**
 * La signature — et pourquoi elle est en suffixe, pas en préfixe.
 *
 * `instead` est écrit par le coach à la deuxième personne, adressé à l'élève
 * (« Trois vrais repas. Si tu as faim entre les deux, c'est que le repas
 * d'avant était trop petit. »). Le préfixer de « Marc dit : » en ferait une
 * citation rapportée et mettrait un narrateur entre les deux — exactement
 * l'inverse de l'effet recherché. En suffixe, l'élève lit d'abord la réponse,
 * puis découvre de qui elle est.
 *
 * PAS DE NOM, PAS DE SIGNATURE. `null` est une valeur légitime — un coach sans
 * `display_name`. « — the coach » serait une signature vide qui attire l'œil
 * sur une absence; mieux vaut la phrase seule, qui reste vraie.
 */
function signAsCoach(text: string, coachDisplayName?: string | null): string {
  const name = String(coachDisplayName ?? "").trim();
  if (!name) return text;
  return `${text}\n\n— ${name}`;
}

/**
 * Applique les deux verrous. L'ordre est le contrat: le MÉDICAL d'abord, parce
 * qu'un texte qui viole les deux doit produire le repli médical (le plus
 * protecteur), jamais celui de la doctrine.
 */
export function applyKeelOutputLocks(input: OutputLockInput): OutputLockResult {
  const text = String(input.text ?? "");

  if (!text.trim()) {
    return { text, reason: "disarmed_empty_text", tokens: [] };
  }
  if (!input.isKeelStudent) {
    return { text, reason: "disarmed_not_keel_student", tokens: [] };
  }

  // CONDITION DE DÉSARMEMENT n°5 (doctrine P9) — LE TOUR DE RÉTRACTATION.
  //
  // Mesurée en QA: l'élève écrit « Actually I'm NOT allergic to peanuts, that
  // was my sister — please remove that », l'agent répond, sa réponse nomme
  // l'allergène (elle ne peut pas faire autrement: accuser une rétractation
  // sans nommer ce qu'on retire est inintelligible), la ceinture voit un token
  // médical et REMPLACE tout le message par « pose la question à un médecin ».
  //
  // C'est un CUL-DE-SAC, et il se referme sur lui-même: chaque nouvelle
  // tentative de correction renomme l'allergène et redéclenche le remplacement.
  // L'élève ne peut jamais corriger, et ne comprend jamais pourquoi. Même
  // famille que `safety-crisis-flow-no-exit-on-denial`: un dispositif qu'on ne
  // peut pas quitter est un piège, pas une protection.
  //
  // PORTÉE VOLONTAIREMENT ÉTROITE: on ne désarme que les contraintes que CE
  // TOUR retire, nommément. Les autres contraintes de l'élève restent gardées
  // dans le même message — retirer une allergie à l'arachide n'ouvre pas la
  // porte au sésame. Et le désarmement vient d'un EFFET DU TOUR, pas d'une
  // heuristique sur le texte: c'est la demande de l'élève, pas une phrase que
  // le modèle aurait pu produire tout seul.
  // ── CE QUE `null` VEUT DIRE, ET POURQUOI IL A SON PROPRE VERDICT ─────────
  //
  // Le type porte la distinction depuis toujours
  // (`readonly StudentSafetyConstraint[] | null`) et les appelants la
  // maintiennent exprès: `generate-meal-v1:887-891` avale l'échec de lecture
  // dans un `catch` muet et laisse `constraints = null`; `router/run.ts:2874`
  // écrit noir sur blanc qu'il PRÉSERVE le `null` plutôt que de le piétiner
  // avec un `[]` de complaisance, « qui le ferait passer pour une lecture
  // réussie sans contrainte ». Jusqu'ici cette moitié ne servait à rien: la
  // ceinture faisait `?? []` et perdait l'information au premier geste.
  //
  // ── LE DÉFAUT MESURÉ (agent 2V, 2026-08-19) ──────────────────────────────
  // La condition de désarmement n°2 exige LES TROIS listes vides. Pour un
  // coach qui a des lignes rouges — c'est-à-dire le cas normal du produit et
  // celui de la fixture — un `constraints = null` ne rendait donc PAS
  // `disarmed_no_constraints`: il traversait tout et ressortait `clean`.
  //
  // Et `clean` est pire qu'un désarmement. `disarmed_*` est un AVEU, qui se
  // lit en télémétrie comme « je n'ai rien vérifié ». `clean` est une
  // AFFIRMATION POSITIVE — « j'ai vérifié, c'est bon » — posée sur un texte
  // qui n'a été confronté à rien. La panne devenait indiscernable non pas
  // d'une absence de contrainte, mais d'un contrôle RÉUSSI. Ce dépôt porte
  // déjà deux cicatrices de cette famille (« ceinture armée sur coffre vide »,
  // « paramètre de garde optionnel = garde désarmée »); celle-ci en est la
  // troisième forme, la garde muette qui se déclare verte.
  //
  // ⚠️ CE VERDICT NE CHANGE RIEN À CE QUI PASSE OU NE PASSE PAS, et c'est
  // délibéré. Il commence par `disarmed` parce que les trois appelants de
  // production décident avec `reason === "clean" || reason.startsWith(
  // "disarmed")` (`meal_generation.ts:4676`, `week_plan_generation.ts:841`,
  // `router/run.ts` qui rend `locked.text`): un préfixe neuf y aurait VIDÉ le
  // plan d'un élève dont la table est injoignable, c'est-à-dire un changement
  // de comportement produit glissé dans un lot d'observabilité. La question
  // « faut-il aussi BLOQUER un texte non vérifié ? » appartient à un humain et
  // reste ouverte.
  //
  // `undefined` compte comme `null`: un appelant qui n'a pas rempli le champ
  // n'a pas non plus lu la table, et le lire autrement serait exactement le
  // « paramètre optionnel = garde désarmée » qu'on refuse ici.
  const constraintsUnreadable = input.safetyConstraints === null ||
    input.safetyConstraints === undefined;
  if (constraintsUnreadable) {
    console.error("keel.output_lock.constraints_unreadable", {
      detail:
        "Safety constraints could not be read; the medical half of the belt " +
        "checked NOTHING this turn. Text delivered unchanged.",
    });
  }

  const retracted = new Set(
    (input.retractedConstraintRefs ?? [])
      .map((r) => String(r ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  const constraints = (input.safetyConstraints ?? []).filter((c) => {
    if (retracted.size === 0) return true;
    const refs = [c.allergenRef, c.substanceRef, c.medicationClass]
      .filter((r): r is string => Boolean(r))
      .map((r) => r.trim().toLowerCase());
    return !refs.some((r) => retracted.has(r));
  });
  const forbidden = input.doctrine?.forbidden ?? [];
  // Les aliments déconseillés comptent dans la condition de désarmement. Les
  // oublier ici rendrait la ceinture muette pour un coach qui n'aurait rempli
  // QUE cette section — c'est-à-dire précisément le coach dont la méthode
  // tient dans « voilà ce que je ne mets pas dans une assiette ».
  const discouragedFoods = input.doctrine?.foods?.discouraged ?? [];
  if (
    constraints.length === 0 && forbidden.length === 0 &&
    discouragedFoods.length === 0
  ) {
    // Deux causes, deux verdicts. « la table dit qu'il n'y a rien » et « je
    // n'ai pas pu lire la table » rendaient le même `disarmed_no_constraints`,
    // et c'est le second qui a besoin d'être vu.
    return {
      text,
      reason: constraintsUnreadable
        ? "disarmed_constraints_unreadable"
        : "disarmed_no_constraints",
      tokens: [],
    };
  }

  const medical = findMedicalConstraintViolations(text, constraints);
  if (medical.length > 0) {
    // ⛔ S2 — LEQUEL DES DEUX TEXTES, ET L'ORDRE EST LE CONTRAT.
    //
    // La ceinture couvre maintenant deux crans. Un texte qui mord les DEUX
    // (« du beurre de cacahuète et un yaourt ») doit produire le repli
    // MÉDICAL, le plus protecteur — jamais le plus doux. C'est le même
    // raisonnement que l'ordre médical-avant-doctrine quelques lignes plus
    // bas, appliqué à l'intérieur du verrou médical.
    //
    // ⚠️ LA SÉVÉRITÉ VIENT DE LA MORSURE, PAS D'UNE RECHERCHE ICI.
    // `findMedicalConstraintViolations` la porte sur chaque violation
    // (`MedicalConstraintViolation.severity`) précisément pour qu'aucun
    // appelant n'ait à rejoindre `constraintId` sur la liste de contraintes:
    // une jointure qui rate rendrait le mauvais texte, en silence.
    const hasMedical = medical.some((v) => v.severity === "medical");
    console.error(hasMedical ? "keel.output_lock.medical" : "keel.output_lock.strict", {
      violation_count: medical.length,
      tokens: [...new Set(medical.map((v) => v.token))].join(","),
      severities: [...new Set(medical.map((v) => v.severity))].sort().join(","),
      detail: "Visible text replaced before delivery.",
    });
    return {
      text: hasMedical ? MEDICAL_BLOCK_FALLBACK_EN : STRICT_BLOCK_FALLBACK_EN,
      reason: hasMedical ? "blocked_medical_constraint" : "blocked_strict_constraint",
      tokens: [...new Set(medical.map((v) => v.token))],
    };
  }

  if (forbidden.length > 0 || discouragedFoods.length > 0) {
    const doctrineViolations = findDoctrineViolations(text, {
      forbidden,
      // Reconstruit plutôt que passé tel quel: `recommended` n'a rien à faire
      // dans un verrou. Un aliment CONSEILLÉ nommé dans une réponse est le
      // comportement voulu, et le passer à un moteur de correspondance qui
      // ignore la distinction bloquerait exactement les bonnes réponses.
      foods: { discouraged: discouragedFoods },
    });
    if (doctrineViolations.length > 0) {
      const tokens = [...new Set(doctrineViolations.map((v) => v.token))];
      // On répond À LA PLACE du coach avec SES mots quand il les a donnés.
      const replacement = resolveDoctrineReplacement(
        tokens,
        forbidden,
        constraints,
        input.coachDisplayName,
      );
      console.error("keel.output_lock.doctrine", {
        violation_count: doctrineViolations.length,
        tokens: tokens.join(","),
        used_coach_words: replacement.usedCoachWords,
        // La signature suit `used_coach_words`: si les deux divergent un jour
        // dans les logs, c'est que le repli générique a été signé — la seule
        // faute que cette fonctionnalité peut commettre.
        signed: replacement.usedCoachWords && Boolean(String(input.coachDisplayName ?? "").trim()),
        detail: "Visible text replaced before delivery.",
      });
      return {
        text: replacement.text,
        reason: "blocked_coach_interdit",
        tokens,
      };
    }
  }

  // ⚠️ `clean` SE MÉRITE. On n'arrive ici que si RIEN n'a mordu — mais « rien
  // n'a mordu » n'a de valeur que si la moitié médicale avait quelque chose à
  // quoi se confronter. Sans la table, ce texte n'a traversé QUE le verrou de
  // doctrine, et le dire `clean` signerait un contrôle qui n'a pas eu lieu.
  return {
    text,
    reason: constraintsUnreadable ? "disarmed_constraints_unreadable" : "clean",
    tokens: [],
  };
}
