// ═══════════════════════════════════════════════════════════════════════════
// LE TEXTE FINAL D'UN TOUR — `finalVisibleText` ET SES CEINTURES
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `run.ts` (découpage des gros fichiers,
// lot 5a). Aucune logique changée. `run.ts` ré-exporte tout ce qui est
// exporté ici : les appelants et les tests continuent d'importer depuis lui.
// Ce module n'importe jamais `run.ts`.
//
// Ce qui est ici : `finalVisibleText`, le seul point de passage de tout
// texte visible, et les fonctions qu'elle appelle pour nettoyer ou
// compléter la réponse (`strip*`, `ensure*`, `appendMealPrecisionQuestion`).
// Fonctions pures, à part les écritures de journal des gardes.

import { logRuntimeGuardEvent } from "../../_shared/guard-log.ts";
import { retractedContentSegments } from "../../_shared/memory/memorizer/retraction_guard.ts";
// W8 — CEINTURE ACCUSÉ FANTÔME SANS EFFET. Le détecteur est PUR et vit dans
// son module; run.ts n'apporte que la vérité du tour (rôle KEEL, nombre de
// commits relus) et l'observabilité.
import {
  guardKeelAckWithoutCommittedEffect,
  KEEL_ACK_GUARD_NAME,
  recordKeelAckGuardTrigger,
} from "../skills/_shared/keel_ack_without_effect_guard.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  buildDirectEffectConfirmationContext,
  committedCorrectionReplyOverride,
} from "./direct_effect_local_context.ts";
import { isSafetyRoute } from "./safety_crisis_runtime.ts";
import {
  ensureVisibleSophiaEmoji,
  stripDeprecatedProductVocabulary,
  stripHiddenHtmlComments,
} from "./response_visibility_formatting.ts";
import { appendPhotoInvitation } from "../../_shared/keel/photo_invitation.ts";
import { appendRedirect } from "../../_shared/keel/conversation_redirect.ts";
// PIVOT §3.3 — la ceinture de sortie (les deux verrous) et le chargeur de
// doctrine. Le raisonnement complet vit dans les modules; ici on ne fait que
// les brancher sur le seul point de passage de tout texte visible.
import { applyKeelOutputLocks } from "../skills/_shared/keel_output_locks.ts";
import {
  applyGroundedSupportBelt,
  detectDiscouragementTurn,
} from "../../_shared/keel/grounded_support.ts";
import {
  householdConstraintRefs,
  NO_HOUSEHOLD_SAFETY,
} from "../../_shared/keel/household_safety.ts";
import {
  enforceTurnLedger,
  TURN_LEDGER_BELT_NAME,
} from "../../_shared/keel/turn_ledger.ts";
import type { KeelTurnContext } from "./keel_turn_context.ts";

export function finalVisibleText(
  text: unknown,
  routeDecision: RouteDecision | null,
  turnFrame: TurnFrame | null,
  // P12-C (eva-hard25 R1-B03): le message user arrive aux gardes PAR CONTRAT
  // — l'ancienne lecture `turnFrame.user_message` visait un champ qui
  // n'existe pas au runtime (la garde P10-V était inatteignable en prod, la
  // probe passait sur un frame synthétique enrichi).
  userMessage: string | undefined,
  // P12-V (probe P12-3 passe 1): l'history du tour alimente la garde de
  // MENTION RÉTRACTÉE — le verrou write-path et l'interdit de contexte ne
  // suffisent pas quand le composeur lit le contenu dans l'historique brut.
  history: unknown,
  // W8: le contexte KEEL du tour. Seule information que les gardes de rendu ne
  // pouvaient PAS déduire du frame — et la ceinture accusé-fantôme est
  // indexée sur `is_student` (hors élève KEEL, il n'y a pas de ligne de
  // protocole à accuser, donc rien à réconcilier).
  //
  // PIVOT §3.3 — le paramètre est passé en OBJET et RENDU OBLIGATOIRE. Deux
  // raisons, et la seconde est la vraie:
  //   1. il porte maintenant aussi les contraintes dures et la doctrine, que
  //      la ceinture de sortie exige;
  //   2. OBLIGATOIRE parce que le défaut qu'on corrige ici est précisément une
  //      garantie « globale » appliquée sur 1 chemin sur N. Avec un paramètre
  //      optionnel, il suffit d'un `finalVisibleText` futur qui l'oublie pour
  //      recréer le trou, en silence. Le compilateur est le seul relecteur qui
  //      ne se fatigue pas. (Même raisonnement que le `binding` obligatoire de
  //      `renderMealPhotoAck`.)
  keel: KeelTurnContext,
) {
  // paul-r6 B01: sur un commit de CORRECTION track, la reply deterministe du
  // tool remplace la paraphrase du composeur — l'historique (refus du tour
  // precedent) ne peut plus battre le contrat du tour. Meme famille que le
  // reply override safety: verite contractuelle > eloquence.
  const correctionOverride = committedCorrectionReplyOverride(
    turnFrame ?? null,
  );
  let out = stripHiddenHtmlComments(correctionOverride ?? text);
  out = stripDeprecatedProductVocabulary(out);
  out = stripForeignScriptTokens(out);
  out = stripCommitClaimBeforeClarify(out, turnFrame ?? null, userMessage);
  out = stripUnfoundedReminderCapacityDenial(out, turnFrame ?? null);
  out = stripTrackClaimWithoutCommit(out, turnFrame ?? null);
  out = ensureCommittedRenderParity(out, turnFrame ?? null, userMessage);
  out = stripRetractedSessionMention(out, history, userMessage, turnFrame);

  // ── LA CEINTURE DU CANAL DÉTERMINISTE → PAROLE ─────────────────────────────
  //
  // Voir `_shared/keel/turn_ledger.ts` pour le mécanisme et les cinq règles.
  // Ici, seulement le PLACEMENT, qui porte trois décisions:
  //
  //  1. HORS du `if (!isSafetyRoute(...))`, et c'est la moitié qui répare T-7.
  //     Le silence du plancher se joue précisément sur les routes de crise et
  //     de restriction; une ceinture qui les évite ne verrait jamais le cas
  //     qu'elle existe pour couvrir. Les quatre autres règles y sont inertes
  //     par construction (aucun plancher de mesure ni d'invitation photo ne
  //     s'arme sur un tour de crise).
  //
  //  2. AVANT `appendPhotoInvitation`, et c'est la moitié qui rend T-6
  //     réparable sans se mordre la queue. La règle « aucune demande de photo
  //     hors budget » retire les sollicitations du COMPOSEUR; l'invitation
  //     ARMÉE par le compteur est ajoutée après, et sort donc intacte. Inverser
  //     l'ordre ferait manger la seule demande légitime du tour.
  //
  //  3. APRÈS les ceintures de contrat de frame (`ensureCommittedRenderParity`,
  //     `stripTrackClaimWithoutCommit`), parce qu'elles réécrivent le corps et
  //     qu'un accusé réinjecté après vérification sortirait intact — même
  //     raisonnement que la note de `stripKeelAckWithoutCommittedEffect`.
  {
    const ledgerBelt = enforceTurnLedger({
      text: out,
      ledger: keel.turn_ledger,
      isKeelStudent: keel.is_student === true,
      isMinor: keel.age_verdict?.status === "minor",
      userMessage: String(userMessage ?? ""),
      // FF-066 — une fiche d'aide qui explique le geste photo n'est pas une
      // demande de photo. Absent ⇒ `false` ⇒ la règle reste armée.
      photoExplainedByAppHelp: keel.app_help_photo === true,
      locale: keel.content_locale ?? "en-GB",
    });
    if (ledgerBelt.reasons.length > 0) {
      // ⚠️ LE MOTIF, JAMAIS LE CONTENU (R9 de FF-007: le coach ne lit jamais
      // les conversations). Et le taux se lit ici: SI CETTE LIGNE EST
      // FRÉQUENTE SUR DES TOURS ORDINAIRES, C'EST LE PROMPT QU'IL FAUT
      // CORRIGER, PAS LA CEINTURE QU'IL FAUT DESSERRER. Un repli devenu
      // nominal est un composeur mort, et il est invisible autrement.
      console.warn("[keel] turn_ledger belt bit", {
        reasons: ledgerBelt.reasons,
        stripped_sentences: ledgerBelt.stripped_sentences,
        ledger: keel.turn_ledger.map((entry) =>
          `${entry.subject}:${entry.outcome}:${entry.reason_code}`
        ),
      });
      logRuntimeGuardEvent({
        guard: TURN_LEDGER_BELT_NAME,
        userId: (turnFrame as { user_id?: string } | null)?.user_id ?? null,
        detail: {
          turn_id: (turnFrame as { turn_id?: string } | null)?.turn_id ?? null,
          reasons: ledgerBelt.reasons,
          stripped_sentences: ledgerBelt.stripped_sentences,
        },
      });
    }
    out = ledgerBelt.text;
  }

  if (!isSafetyRoute(routeDecision)) {
    out = ensureVisibleSophiaEmoji(out);
    out = ensureClarifyQuestionVisible(out, turnFrame ?? null);
    // W8 — DERNIÈRE ceinture du rendu, à dessein: elle doit voir le texte
    // FINAL (y compris ce que `ensureClarifyQuestionVisible` vient de
    // réinjecter), sinon un accusé rajouté après elle sortirait intact.
    out = stripKeelAckWithoutCommittedEffect(
      out,
      turnFrame ?? null,
      userMessage,
      keel.is_student === true,
      routeDecision?.response_owner === "disordered_eating_guard",
    );
    // LA QUESTION DE PRÉCISION, en dernier dans le bloc non-crise.
    //
    // APRÈS la ceinture d'accusé fantôme, exprès: cette question n'est pas un
    // accusé — elle ne prétend rien avoir enregistré — et la faire passer dans
    // un détecteur d'accusé ne pourrait que la mutiler. Elle vient après pour
    // la même raison que la ceinture vient après `ensureClarifyQuestionVisible`:
    // le dernier à écrire est le seul qui sait ce que l'élève lira.
    //
    // ET DANS le `if (!isSafetyRoute(...))`: un tour de crise est le dernier
    // endroit où l'on demande à quelqu'un avec quoi il a mangé son poulet. La
    // bande de safety ferme déjà l'armement en amont (`gateMealPrecisionQuestion`);
    // ceci est la seconde barrière, sur la route cette fois.
    // ── FF-011 · LE SOUTIEN EST GROUNDÉ OU IL EST COURT ─────────────────────
    //
    // AVANT la question de précision, exprès: si la ceinture réécrit le corps,
    // la question doit s'accrocher au texte que l'élève va réellement lire.
    //
    // DANS le `if (!isSafetyRoute(...))`, et c'est la moitié la plus importante
    // du placement: la crise et le plancher TCA ont leurs propres chemins,
    // leurs ressources par pays et leurs gardes, et cette fiche NE LES TRAVERSE
    // PAS. Le `disordered_eating_guard` est exclu par le même test que la
    // ceinture d'accusé fantôme trois lignes plus haut.
    //
    // ⚠️ ELLE NE S'ARME QUE SUR UN TOUR DE DÉCOURAGEMENT, reconnu
    // DÉTERMINISTIQUEMENT. Mordre sur tous les tours refuserait des réponses
    // correctes et le repli deviendrait le cas nominal en silence — « un
    // composeur mort déguisé en composeur prudent ».
    if (
      keel.is_student &&
      routeDecision?.response_owner !== "disordered_eating_guard"
    ) {
      const discouraged = detectDiscouragementTurn(userMessage);
      if (discouraged) {
        const belt = applyGroundedSupportBelt({
          text: out,
          facts: keel.day_facts,
          week: keel.week_review?.reading ?? null,
          contentLocale: keel.content_locale ?? "en-GB",
        });
        if (belt.reasons.length > 0) {
          // §5 de la fiche: UNE SEULE TRACE, en observabilité et pas en base
          // métier. Le motif, jamais le contenu — R9 de FF-007: le coach ne
          // lit jamais les conversations, et §10 doit être mesurable sans ça.
          //
          // ⚠️ SI CE TAUX EST ÉLEVÉ, C'EST LE PROMPT QU'IL FAUT CORRIGER, PAS
          // LA CEINTURE QU'IL FAUT DESSERRER. Un repli devenu nominal est un
          // composeur mort, et il est invisible autrement.
          console.warn("[keel] grounded_support belt bit", {
            reasons: belt.reasons,
            matched: belt.matched,
            ground: keel.support_ground,
            discouragement_marker: discouraged.matched,
            rewritten_to_fallback: belt.text.length < 120 &&
              belt.matched.length > 0,
          });
        }
        out = belt.text;
      }
    }

    // ── FF-025 · L'INVITATION À LA PHOTO ────────────────────────────────────
    //
    // AVANT la question de précision, et dans le même bloc non-crise, pour
    // trois raisons:
    //  1. les deux ne peuvent pas sortir ensemble — le budget partagé (T4) a
    //     empêché l'armement de la seconde dès que la première a pris sa
    //     place, et c'est le SEUL mécanisme d'exclusion (il n'y a pas de
    //     vérification ici, exprès: elle serait un second lieu de vérité);
    //  2. `!isSafetyRoute(...)` est la seconde barrière de R5. Le gate ferme
    //     déjà sur toute bande ≠ `none`, mais une route de crise reconstruite
    //     APRÈS l'armement doit encore pouvoir taire la phrase;
    //  3. après la ceinture d'accusé fantôme, comme la question: une
    //     invitation ne prétend rien avoir enregistré, et la faire passer dans
    //     un détecteur d'accusé ne pourrait que la mutiler.
    out = appendPhotoInvitation(out, keel.meal_photo_invitation);
    out = appendMealPrecisionQuestion(
      out,
      keel.meal_precision_question,
      () => {
        // La question n'est pas partie. Le flow doit donc s'ouvrir en
        // « correction seulement »: l'élève garde le droit d'amender son repas
        // au lieu d'en écrire un second, mais on ne prétend pas lui avoir
        // demandé quoi que ce soit.
        keel.meal_precision_question = null;
      },
    );

    // ── LOT 2C · LE RENVOI DU SIZING, ET IL EST DIT ─────────────────────────
    //
    // EN DERNIER DU BLOC NON-CRISE, et les trois moitiés du placement comptent:
    //
    //  1. DANS `finalVisibleText`, parce que c'est le SEUL entonnoir que tous
    //     les chemins de sortie traversent. Le renvoi est armé bien plus haut,
    //     juste après le calcul des signaux du dispatcher; entre les deux il y a
    //     les lanes KEEL, dont `plan_question`, qui rend sa PROPRE réponse et
    //     capture une part importante des tours. Une phrase posée en amont
    //     d'elle serait avalée sans laisser de trace — et « rendu par un outil »
    //     n'est pas « dit » dans ce dépôt.
    //
    //  2. APRÈS les deux ajouts armés (invitation photo, question de précision)
    //     et après toutes les ceintures de rendu. Ce n'est ni un accusé (il ne
    //     prétend rien avoir enregistré — au contraire, il dit qu'on ne range
    //     PAS) ni une sollicitation au budget partagé: il ne demande rien, il
    //     explique où va ce que la personne vient de dire. Le faire passer dans
    //     un détecteur d'accusé ne pourrait que le mutiler.
    //
    //  3. DANS le `if (!isSafetyRoute(...))`: un tour de crise est le dernier
    //     endroit où l'on parle de la taille des portions.
    //
    // ⚠️ LE TEXTE EST BILINGUE ET FERMÉ, résolu chez `sizingRedirectFor` à
    // partir de `content_locale`. Une garde testée dans une seule langue ne mord
    // pas dans l'autre, et ce produit a `fr-FR` par défaut.
    const beforeSizingRedirect = out;
    out = appendRedirect(out, keel.sizing_redirect);
    // ── LOT 4A · LE TROISIÈME NOMBRE, MESURÉ LÀ OÙ LA PHRASE EST DITE ────────
    //
    // ⚠️ « ARMÉ » N'EST PAS « DIT », et c'est exactement la distinction que ce
    // dépôt paie cher: `reply visible ≠ rendu d'un outil`. Un compteur posé au
    // seul armement dirait « ça marche » sur un tour où la ceinture aurait
    // rendu le texte inchangé (phrase déjà présente, chemin de sortie qui ne
    // traverse pas d'ici). On compare donc le texte AVANT et APRÈS: la ligne
    // ne part que si la sortie a réellement grossi de la phrase.
    if (out !== beforeSizingRedirect) {
      console.info(JSON.stringify({
        tag: "keel/sizing_redirect",
        event: "said",
        turn_id: turnFrame?.turn_id ?? null,
        response_owner: routeDecision?.response_owner ?? null,
        locale: keel.content_locale ?? null,
      }));
    }
    // ── LOT M1 · LE RENVOI VERS UN CHAMP, AU MÊME ENDROIT ────────────────────
    //
    // ⚠️ APRÈS LE RENVOI DU SIZING, ET LES DEUX PEUVENT SORTIR SUR LE MÊME
    // TOUR. « ça m'a fait beaucoup trop de riz, et de toute façon je n'ai pas
    // de four » porte les deux signaux, et ils vont vers deux écrans
    // différents: le bilan pour la part, les réglages pour le four. En garder
    // un seul ferait perdre l'autre en silence — c'est-à-dire la panne que ce
    // lot ferme. `appendRedirect` ne double jamais une phrase déjà présente,
    // donc le cas où le modèle émettrait deux fois la même chose est couvert.
    const beforeProfileRedirect = out;
    out = appendRedirect(out, keel.profile_redirect);
    // Même mesure « armé ≠ dit » que ci-dessus, et pour la même raison.
    if (out !== beforeProfileRedirect) {
      console.info(JSON.stringify({
        tag: "keel/profile_redirect",
        event: "said",
        turn_id: turnFrame?.turn_id ?? null,
        response_owner: routeDecision?.response_owner ?? null,
        locale: keel.content_locale ?? null,
      }));
    }
    // ── LOT M6 · LA RÉVOCATION, AU MÊME ENDROIT ────────────────────────────
    //
    // ⚠️ LES TROIS PEUVENT SORTIR SUR LE MÊME TOUR, et c'est voulu: « pourquoi
    // jamais de poulet ? et de toute façon je n'ai pas de four » porte deux
    // signaux qui vont à deux endroits. `appendRedirect` ne double jamais une
    // phrase déjà présente.
    const beforeRuleQuestion = out;
    out = appendRedirect(out, keel.rule_question_redirect);
    if (out !== beforeRuleQuestion) {
      console.info(JSON.stringify({
        tag: "keel/rule_question",
        event: "said",
        turn_id: turnFrame?.turn_id ?? null,
        response_owner: routeDecision?.response_owner ?? null,
        locale: keel.content_locale ?? null,
      }));
    }
  }
  out = out.trim();

  // PIVOT §3.3 — LES DEUX VERROUS DÉTERMINISTES, EN TOUT DERNIER.
  //
  // Position volontairement finale, après TOUTES les autres ceintures: elles
  // réinjectent du texte (`ensureClarifyQuestionVisible`,
  // `ensureVisibleSophiaEmoji`, l'override de correction), et un allergène
  // réintroduit après la vérification sortirait intact. C'est le même
  // raisonnement que la note de `stripKeelAckWithoutCommittedEffect`, poussé
  // d'un cran.
  //
  // ET HORS DU `if (!isSafetyRoute(...))`, exprès: un tour de crise est le
  // dernier endroit où l'on veut suggérer un allergène médical.
  // ── L'UNION DES DEUX LANES, ET C'EST ICI QU'ELLE SE FAIT ─────────────────
  //
  // La ceinture n'attribue rien: elle refuse qu'un jeton médical soit NOMMÉ.
  // C'est le seul endroit où les contraintes du locuteur et celles des autres
  // bouches du foyer font le même travail, donc le seul où les fondre ne peut
  // pas produire un fait faux sur une personne (le prompt, lui, garde deux
  // blocs — voir `household_safety` sur `KeelTurnContext`).
  //
  // ⚠️ `null` (« pas lu ») EST PRÉSERVÉ QUAND IL N'Y A RIEN À AJOUTER: la
  // distinction null / [] de la lane individuelle est ce qui rend son incident
  // lisible, et la piétiner avec un `[]` de complaisance la ferait passer pour
  // une lecture réussie sans contrainte.
  //
  // ── CE QUE ÇA CHANGE POUR DE VRAI, ET IL FAUT LE DIRE ────────────────────
  // La ceinture mord sur TOUT le tour, pas seulement sur ce qui parle de la
  // casserole. Dans un foyer où une allergie médicale au lait est déclarée,
  // Sophia cesse de nommer le lait, même à propos de l'assiette du seul
  // locuteur. C'est le sur-blocage assumé de la doctrine de ce dépôt — « sur-
  // bloquer escalade, sous-bloquer sert l'allergène, et seul le premier est
  // récupérable » — et c'est la même règle que le générateur applique déjà à la
  // casserole entière. Ce qui la rend tenable est en amont: une ligne de
  // `household_member_allergies` est une allergie MÉDICALE, écrite comme telle;
  // une préférence parentale a son propre chemin (`household_food_restrictions`)
  // et n'arme rien ici.
  const householdSafety = keel.household_safety ?? NO_HOUSEHOLD_SAFETY;
  const beltConstraints = householdSafety.constraints.length === 0
    ? keel.safety_constraints
    : [...(keel.safety_constraints ?? []), ...householdSafety.constraints];
  // ── CE QU'UNE RÉTRACTATION NE PEUT PAS DÉSARMER ──────────────────────────
  //
  // Le désarmement n°5 laisse quelqu'un faire nommer la contrainte qu'il vient
  // de RETIRER — la sienne. Une allergie de foyer n'est pas la sienne: la
  // rétractation du chat n'écrit que dans `student_safety_constraints`, la
  // ligne du foyer survit, et l'honorer ferait taire l'allergie d'un enfant
  // parce qu'un adulte a dit que la sienne avait disparu. On la retire sur
  // l'écran du foyer, là où elle a été écrite.
  const householdRefs = householdConstraintRefs(householdSafety.constraints);
  const locked = applyKeelOutputLocks({
    text: out,
    isKeelStudent: keel.is_student === true,
    safetyConstraints: beltConstraints,
    doctrine: keel.doctrine?.doctrine ?? null,
    // POUR SIGNER LA SUBSTITUTION. Passé ICI et pas dans les générateurs: quand
    // le verrou mord dans le chat, ce qui part est la phrase que le coach a
    // écrite mot pour mot à « qu'est-ce que tu dis à la place ? ». Elle sortait
    // anonyme — donc l'élève lisait la position de son coach sans savoir
    // qu'elle était de lui, au moment précis où il pousse contre sa méthode,
    // c'est-à-dire quand l'autorité compte le plus.
    //
    // Déjà résolu par `loadPublishedDoctrine` (une seule lecture de
    // `coaches.display_name` par tour); on ne le relit pas ici.
    coachDisplayName: keel.doctrine?.coachDisplayName ?? null,
    // Condition de désarmement n°5: ce que CE TOUR retire. Lu depuis le FRAME
    // (la demande de l'élève), pas depuis le texte généré — une ceinture qui
    // se désarmerait sur une phrase que le modèle a écrite se désarmerait
    // toute seule.
    retractedConstraintRefs: retractedConstraintRefsIn(turnFrame)
      .filter((ref) => !householdRefs.has(ref.trim().toLowerCase())),
  });
  return locked.text;
}

/**
 * Les identifiants qu'un tour demande de RETIRER.
 *
 * Lu sur `direct_effects` — donc sur ce que l'élève a demandé — et non sur les
 * effets committés: la ceinture s'applique au rendu, qui peut précéder ou
 * suivre l'écriture, et une rétractation qui échoue en base doit quand même
 * pouvoir être EXPLIQUÉE à l'élève. Le pire cas d'un désarmement trop large
 * ici est une phrase qui nomme un allergène que l'élève vient lui-même de
 * nommer pour le retirer; le pire cas de l'inverse est un élève enfermé.
 */
function retractedConstraintRefsIn(frame: TurnFrame | null): string[] {
  if (!frame) return [];
  const refs: string[] = [];
  for (const effect of frame.direct_effects ?? []) {
    if (effect.effect_type !== "declare_safety_constraint") continue;
    const payload = (effect.payload_hint ?? {}) as Record<string, unknown>;
    if (String(payload.intent ?? "").trim().toLowerCase() !== "retract") {
      continue;
    }
    for (
      const key of ["allergen_ref", "substance_ref", "medication_class"]
    ) {
      const value = String(payload[key] ?? "").trim();
      if (value) refs.push(value);
    }
  }
  return refs;
}

/**
 * LA QUESTION DE PRÉCISION, POSÉE PAR LE RUNTIME ET PAS PAR LE MODÈLE.
 *
 * POURQUOI ICI ET PAS DANS LE PROMPT DU COMPOSEUR. Le §3 du chantier pose une
 * ligne rouge: « une question de précision ne demande JAMAIS une quantité ».
 * Confier cette question à une génération, c'est la remettre en jeu à chaque
 * tour — et ce dépôt a déjà mesuré que les correctifs prompt-only régressent en
 * run réel (`p8-revalidation-rose-reds`). Le texte est un gabarit fermé, il
 * arrive ici tel quel, et il n'existe aucun chemin par lequel il pourrait
 * devenir « tu en as mangé combien ? ».
 *
 * L'ANTI-INTERROGATOIRE EST STRUCTUREL, ET IL FAIL-SAFE. Si le composeur a déjà
 * posé une question, la question de précision est ABANDONNÉE plutôt qu'ajoutée:
 * « deux questions sont un interrogatoire, et l'élève cesse d'écouter ». On
 * perd une précision; on ne perd pas l'élève. C'est l'arbitrage du §7 —
 * « la précision n'a de valeur que jusqu'au point où elle coûte l'adhésion ».
 *
 * CONDITION DE DÉSARMEMENT (doctrine P9): sans question armée, la fonction rend
 * le texte inchangé, et elle n'en RETIRE jamais aucune. Elle ne peut donc pas
 * appauvrir une réponse; au pire elle n'ajoute rien.
 */
export function appendMealPrecisionQuestion(
  text: string,
  question: string | null | undefined,
  /**
   * Appelé quand la question est ABANDONNÉE. L'appelant doit alors rouvrir le
   * flow SANS question: sinon le classifieur du tour suivant serait interrogé
   * sur une question que l'élève n'a jamais lue, et jugerait sa phrase comme
   * une réponse à rien.
   */
  onDropped?: () => void,
): string {
  const source = String(text ?? "");
  const asked = String(question ?? "").trim();
  if (!asked) return source;
  // Déjà présente (rejeu, ou composeur qui a recopié le gabarit): ne pas la
  // doubler. Comparaison EXACTE sur un gabarit fermé — pas une heuristique de
  // sens, une égalité de chaîne.
  if (source.includes(asked)) return source;
  if (source.includes("?")) {
    // Le composeur a déjà posé sa question. On se tait.
    console.log(
      `[keel] meal_precision_question dropped: reply already carries a question`,
    );
    onDropped?.();
    return source;
  }
  const body = source.trim();
  return body ? `${body}\n\n${asked}` : asked;
}

/**
 * W8 — CEINTURE ACCUSÉ FANTÔME SANS EFFET (adaptateur runtime).
 *
 * Le raisonnement complet, le détecteur et la condition de désarmement vivent
 * dans `skills/_shared/keel_ack_without_effect_guard.ts` (fonctions pures).
 * Ici on ne fait que deux choses, et ce sont les deux que le module ne peut
 * pas faire seul:
 *
 *  1. LIRE LA VÉRITÉ D'EXÉCUTION DU TOUR. `committedEffectCount` est la
 *     longueur de `direct_effect_lane.committed_effects` — des lignes RELUES
 *     par les exécuteurs, jamais des demandes. C'est le même champ que lisent
 *     `stripTrackClaimWithoutCommit` et `ensureCommittedRenderParity`: une
 *     seule source de vérité de commit par tour.
 *     NOTE, et c'est tout l'intérêt de cette ceinture: quand le dispatcher
 *     n'émet RIEN, la lane est absente et le compte vaut 0 — c'est
 *     précisément le chemin où toutes les gardes ledger-first sont muettes.
 *  2. COMPTER ET TRACER. Le compteur d'isolat sert au log de tour; la ligne
 *     `guards` de `system_error_logs` est le canal durable qui donne le TAUX
 *     RÉEL dans le fil admin.
 */
export function stripKeelAckWithoutCommittedEffect(
  text: string,
  turnFrame: TurnFrame | null,
  userMessage: string | undefined,
  isKeelStudent: boolean,
  isRestrictionFloorTurn = false,
): string {
  const source = String(text ?? "");
  if (!isKeelStudent || !source.trim()) return source;
  const lane = (turnFrame as { direct_effect_lane?: unknown } | null)
    ?.direct_effect_lane as Record<string, unknown> | null | undefined;
  const committed = Array.isArray(lane?.committed_effects)
    ? (lane?.committed_effects as unknown[])
    : [];
  const result = guardKeelAckWithoutCommittedEffect({
    text: source,
    userMessage: String(userMessage ?? ""),
    isKeelStudent: true,
    committedEffectCount: committed.length,
    // La route safety a déjà été écartée par l'appelant
    // (`if (!isSafetyRoute(routeDecision))`); on reste explicite pour que la
    // condition de désarmement n°2 soit lisible à cet endroit aussi.
    isSafetyTurn: false,
    isRestrictionFloorTurn,
  });
  if (!result.triggered) return source;
  const count = recordKeelAckGuardTrigger();
  console.warn(
    `[keel] ack_guard triggered count=${count}` +
      ` stripped=${result.stripped_sentences}` +
      ` locale=${result.detection.locale}` +
      ` object=${result.detection.reported_object ? "yes" : "none"}`,
  );
  logRuntimeGuardEvent({
    guard: KEEL_ACK_GUARD_NAME,
    userId: (turnFrame as { user_id?: string } | null)?.user_id ?? null,
    detail: {
      turn_id: (turnFrame as { turn_id?: string } | null)?.turn_id ?? null,
      reason_code: result.reason_code,
      stripped_sentences: result.stripped_sentences,
      detected_locale: result.detection.locale,
      isolate_trigger_count: count,
    },
  });
  return result.text;
}

/**
 * P12-V (probe P12-3 passe 1) — GARDE DE MENTION RÉTRACTÉE, le filet
 * STRUCTUREL de la famille rétractation : le verrou write-path (memorizer)
 * et l'interdit de contexte (loader) ne suffisent pas quand le composeur
 * restitue le contenu depuis l'HISTORIQUE brut de conversation (« Tu voulais
 * te remettre à la natation » sur un recall générique, 4e occurrence réelle
 * de la famille). Toute phrase du rendu qui porte un token significatif d'un
 * segment rétracté en session est retirée — SAUF réouverture NOMINATIVE (le
 * message user COURANT renomme lui-même ce contenu). Condition de
 * suppression : composeur fiable sous l'interdit de contexte (0 strip sur
 * 3 vagues).
 */
export function stripRetractedSessionMention(
  text: string,
  history: unknown,
  userMessage?: string,
  turnFrame?: TurnFrame | null,
): string {
  const source = String(text ?? "");
  if (!source.trim() || !Array.isArray(history)) return source;
  const normalize = (value: string) =>
    String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[’']/g, " ").toLowerCase();
  let segments: string[] = [];
  try {
    segments = retractedContentSegments(
      (history as Array<Record<string, unknown>>).map((entry) => ({
        role: (String(entry?.role ?? "") === "user"
          ? "user"
          : "assistant") as "user" | "assistant",
        content: String(entry?.content ?? ""),
      })),
    );
  } catch (_error) {
    return source; // fail-open: la garde n'invente jamais un strip.
  }
  if (segments.length === 0) return source;
  const stopwords = new Set([
    "avoir", "faire", "etre", "chose", "choses", "vraiment", "toujours",
    "jamais", "encore", "cette", "cette", "comme", "quand", "aussi", "alors",
    "depuis", "moment", "projet", "envie", "trotte",
  ]);
  const normalizedUser = normalize(String(userMessage ?? ""));
  const forbiddenTokens = [
    ...new Set(
      segments.flatMap((segment) =>
        normalize(segment).split(/[^a-z0-9]+/)
          .filter((token) => token.length >= 5 && !stopwords.has(token))
      ),
    ),
    // Réouverture nominative: un token renommé par le user COURANT redevient
    // mentionnable.
  ].filter((token) => !normalizedUser.includes(token));
  if (forbiddenTokens.length === 0) return source;
  const sentences = source.split(/(?<=[.!?\n])/);
  const kept = sentences.filter((sentence) => {
    const normalizedSentence = normalize(sentence);
    return !forbiddenTokens.some((token) =>
      normalizedSentence.includes(token)
    );
  });
  if (kept.length === sentences.length) return source;
  console.warn("[Router] retracted-session mention stripped (P12-V)");
  logRuntimeGuardEvent({
    guard: "retracted_mention_stripped",
    userId: (turnFrame as { user_id?: string } | null | undefined)?.user_id ??
      null,
    detail: {
      turn_id:
        (turnFrame as { turn_id?: string } | null | undefined)?.turn_id ??
          null,
    },
  });
  return kept.join("").replace(/[ \t]{2,}/g, " ").trim() ||
    "Rien que je doive te ressortir là-dessus — dis-moi ce qui t'aiderait maintenant.";
}

/**
 * P12-C (alex-untested24 R1-B05/B08/B12, nina-p10reval R1-B03c) — PARITÉ
 * INVERSE rendu=ledger. P8-F/P10-V couvrent le claim-sans-commit; le miroir
 * n'existait pas: (a) un tour à N commits rappel rendu « je n'ai rien
 * fait » (2 commits committés en silence, découverts par hasard 7 tours
 * plus tard puis requalifiés « erreur d'affichage »), (b) « j'ai annulé X »
 * sans AUCUN commit cancel du tour, (c) « X reste tel quel » alors que son
 * cancel est committé au même tour. Ces cas ne produisaient AUCUNE ligne
 * guards (les gardes lisaient le rendu, pas le ledger).
 * Politique: les DÉNIS et faux-intacts sont retirés, les commits non accusés
 * sont APPENDUS depuis la vérité du ledger (labels/instructions committés) —
 * jamais de texte inventé, jamais un commit silencieux.
 */
export function ensureCommittedRenderParity(
  text: string,
  turnFrame: TurnFrame | null,
  userMessage?: string,
): string {
  const source = String(text ?? "");
  if (!turnFrame || !source.trim()) return source;
  const lane = (turnFrame as { direct_effect_lane?: unknown })
    .direct_effect_lane as Record<string, unknown> | null | undefined;
  const committed = Array.isArray(lane?.committed_effects)
    ? lane?.committed_effects as Array<Record<string, unknown>>
    : [];
  const committedCreates = committed.filter((effect) =>
    String(effect?.type ?? "") === "create_one_shot_reminder"
  );
  const committedCancels = committed.filter((effect) =>
    String(effect?.type ?? "") === "cancel_one_shot_reminder"
  );
  // P12-F (rose-hard25 R1-B01 volet rendu): un track committé jamais annoncé
  // — la demi-coche silencieuse n'était découverte que par audit DB. Même
  // parité que les rappels : commit non mappé ⇒ appendu depuis le ledger.
  const committedTracks = committed.filter((effect) =>
    String(effect?.type ?? "") === "track_progress_plan_item"
  );
  const normalize = (value: string) =>
    String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[’']/g, " ").toLowerCase();
  const normalizedSource = normalize(source);
  const normalizedUser = normalize(String(userMessage ?? ""));
  let out = source;
  let guardFired: string | null = null;
  // (b) Claim « annulé » sans AUCUN commit cancel du tour — borné aux tours
  // où le user a demandé une annulation (mutation des deux côtés, doctrine
  // P10-V) et où rien d'autre ne légitime le mot (un replace committé porte
  // son cancel: exempt par construction, committedCancels > 0).
  if (
    committedCancels.length === 0 &&
    /\bannul/.test(normalizedUser) &&
    /\bj ?.?ai (bien |deja )?annule\b|\bc ?.?est (bien )?annule\b|\best (bien |deja )?annule\b/
      .test(normalizedSource)
  ) {
    const sentences = out.split(/(?<=[.!?\n])/);
    const kept = sentences.filter((sentence) =>
      !/\bj ?.?ai (bien |deja )?annule\b|\bc ?.?est (bien )?annule\b|\best (bien |deja )?annule\b/
        .test(normalize(sentence))
    );
    out = kept.join("").replace(/[ \t]{2,}/g, " ").trim() ||
      "Je n'ai annulé aucun rappel sur ce tour — dis-moi lequel tu veux annuler (son heure ou son objet) et je le fais.";
    guardFired = "cancel_claim_without_commit_stripped";
  }
  if (
    committedCreates.length > 0 || committedCancels.length > 0 ||
    committedTracks.length > 0
  ) {
    // (a) Un DÉNI global (« je n'ai rien changé/fait ») ne peut pas coexister
    // avec un commit du tour — la phrase saute (les nuances « rien d'autre »
    // restent).
    const denialPattern =
      /\bje n ?.?ai (rien|pas) (change|changé|fait|touche|touché|modifie|modifié|deplace|déplacé|decale|décalé|annule|annulé)\b|\brien n ?.?a (change|changé|bouge|bougé|ete modifie|été modifié)\b/;
    const hasDenial = out.split(/(?<=[.!?\n])/).some((sentence) => {
      const normalizedSentence = normalize(sentence);
      return denialPattern.test(normalizedSentence) &&
        !/\bd autre|de plus|du reste|a part\b/.test(normalizedSentence);
    });
    if (hasDenial) {
      out = out.split(/(?<=[.!?\n])/).filter((sentence) => {
        const normalizedSentence = normalize(sentence);
        return !(denialPattern.test(normalizedSentence) &&
          !/\bd autre|de plus|du reste|a part\b/.test(normalizedSentence));
      }).join("").replace(/[ \t]{2,}/g, " ").trim();
      guardFired = guardFired ?? "commit_omitted_in_render";
    }
    // (c) « reste tel quel / inchangé / toujours actif » sur un tour qui
    // committe un cancel = faux-intact potentiel — la phrase saute, l'accusé
    // de cancel appendu ci-dessous rétablit la vérité.
    if (
      committedCancels.length > 0 &&
      /\breste(nt)? (tel(le)?s? quel(le)?s?|inchange|intact|actif|active|en place|comme prevu)\b/
        .test(normalizedSource)
    ) {
      out = out.split(/(?<=[.!?\n])/).filter((sentence) =>
        !/\breste(nt)? (tel(le)?s? quel(le)?s?|inchange|intact|actif|active|en place|comme prevu)\b/
          .test(normalize(sentence))
      ).join("").replace(/[ \t]{2,}/g, " ").trim();
      guardFired = guardFired ?? "commit_omitted_in_render";
    }
    // Accusés manquants: chaque commit doit être mappé dans le rendu (label
    // horaire ou token d'instruction pour un create; un mot d'annulation
    // pour un cancel). Un commit non mappé est APPENDU depuis le ledger.
    const additions: string[] = [];
    // P12-V (probe P12-1 passe 2): sur un fan-out MÊME objet / MÊME heure,
    // l'heure et l'instruction ne discriminent plus les commits — le rendu
    // « Vendredi n'est pas encore noté » passait le mapping via le « 18h »
    // de la phrase jeudi. Quand un ancrage collisionne (partagé par ≥2
    // commits), seule l'ancre de JOUR du label mappe ; et un DÉNI NOMINATIF
    // d'un commit (« vendredi … n'est pas encore noté ») est retiré.
    const createHHMMs = committedCreates.map((effect) =>
      normalize(
        String(effect?.local_label ?? "").match(
          /\d{1,2}[:h]\d{2}|\d{1,2}\s?h/,
        )?.[0] ?? "",
      ).replace(":", "h")
    );
    const createInstructions = committedCreates.map((effect) =>
      normalize(String(effect?.reminder_instruction ?? "").trim())
    );
    const dayAnchorsOf = (label: string): string[] => {
      const normalizedLabel = normalize(label);
      const weekday = normalizedLabel.match(
        /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|apres[- ]demain|aujourd hui)\b/,
      )?.[1];
      const dayNumber = normalizedLabel.match(/\b(\d{1,2}) (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/)?.[1];
      return [weekday, dayNumber].filter(Boolean) as string[];
    };
    const negativeClaimPattern =
      /\bn ?.?(est|a) pas (encore )?(note|pose|cale|programme|pris|enregistre)\b/;
    for (const effect of committedCreates) {
      const label = String(effect?.local_label ?? "").trim();
      const anchors = dayAnchorsOf(label);
      const denialSentences = out.split(/(?<=[.!?\n])/).filter((sentence) => {
        const normalizedSentence = normalize(sentence);
        return negativeClaimPattern.test(normalizedSentence) &&
          anchors.some((anchor) => normalizedSentence.includes(anchor));
      });
      if (denialSentences.length > 0) {
        out = out.split(/(?<=[.!?\n])/).filter((sentence) =>
          !denialSentences.includes(sentence)
        ).join("").replace(/[ \t]{2,}/g, " ").trim();
        guardFired = guardFired ?? "commit_omitted_in_render";
      }
    }
    for (const [index, effect] of committedCreates.entries()) {
      const label = String(effect?.local_label ?? "").trim();
      const instruction = String(effect?.reminder_instruction ?? "").trim();
      const hhmm = createHHMMs[index];
      const normalizedOut = normalize(out);
      const hhmmShared =
        createHHMMs.filter((value) => value && value === hhmm).length > 1;
      const instructionShared = createInstructions.filter((value) =>
        value && value === createInstructions[index]
      ).length > 1;
      const anchors = dayAnchorsOf(label);
      const dayMapped = anchors.length > 0 &&
        anchors.some((anchor) => normalizedOut.includes(anchor));
      const labelMapped = (!hhmmShared && hhmm &&
        normalizedOut.includes(hhmm)) ||
        (label && normalizedOut.includes(normalize(label))) || dayMapped;
      const instructionTokens = normalize(instruction).split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4);
      const instructionMapped = !instructionShared &&
        instructionTokens.some((token) => normalizedOut.includes(token));
      if (!labelMapped && !instructionMapped) {
        additions.push(
          `⚠️ Pour être transparente : j'ai bien enregistré un rappel${
            label ? ` pour ${label}` : ""
          }${instruction ? ` — « ${instruction} »` : ""}. Dis-moi si tu veux l'annuler ou le déplacer.`,
        );
      }
    }
    for (const effect of committedTracks) {
      const title = normalize(String(effect?.target_title ?? ""));
      const titleTokens = title.split(/[^a-z0-9]+/).filter((token) =>
        token.length >= 4
      );
      const normalizedOut = normalize(out);
      const titleMapped = titleTokens.length === 0 ||
        titleTokens.some((token) => normalizedOut.includes(token));
      const genericAck =
        /\b(note|coche|enregistre|marque|compte|pris en compte)\b/.test(
          normalizedOut,
        );
      if (!titleMapped && !genericAck) {
        additions.push(
          `⚠️ Pour être transparente : j'ai bien noté ta progression sur « ${
            String(effect?.target_title ?? "ton action")
          } ». Dis-moi si c'est une erreur et je la corrige.`,
        );
      }
    }
    if (
      committedCancels.length > 0 &&
      !/\bannul/.test(normalize(out))
    ) {
      const cancelLabels = committedCancels.flatMap((effect) => {
        const labels = Array.isArray(effect?.target_local_labels)
          ? effect.target_local_labels as unknown[]
          : [effect?.local_label];
        return labels.map((value) => String(value ?? "").trim()).filter(
          Boolean,
        );
      });
      additions.push(
        `⚠️ Et pour être exacte : le rappel${
          cancelLabels.length > 1 ? "s" : ""
        }${
          cancelLabels.length ? ` de ${cancelLabels.join(" ; ")}` : " visé"
        } a été annulé sur ce tour.`,
      );
    }
    if (additions.length > 0) {
      out = [out.trim(), ...additions].filter(Boolean).join("\n\n");
      guardFired = guardFired ?? "commit_omitted_in_render";
    }
  }
  if (guardFired) {
    console.warn(`[Router] committed render parity guard fired (${guardFired})`);
    logRuntimeGuardEvent({
      guard: guardFired,
      userId: (turnFrame as { user_id?: string }).user_id ?? null,
      detail: {
        turn_id: (turnFrame as { turn_id?: string }).turn_id ?? null,
        committed_creates: committedCreates.length,
        committed_cancels: committedCancels.length,
        committed_tracks: committedTracks.length,
      },
    });
  }
  return out;
}

/**
 * P10-C (eva-hard24 R1-B01): GARDE ANTI-REFUS-CONFABULÉ — sur un tour
 * multi-intent où le planner a perdu l'effet rappel, le composeur inventait
 * « je ne peux pas le créer ici » (faux: la capacité existe, les tours
 * voisins créent). Un refus de capacité RAPPEL n'est légitime que si un
 * outcome create_one_shot_reminder existe sur le tour (blocked/clarify — la
 * raison contractuelle du refus). Sans aucun outcome de ce type, la phrase
 * de refus est retirée et remplacée par une récupération honnête.
 */
export function stripUnfoundedReminderCapacityDenial(
  text: string,
  turnFrame: TurnFrame | null,
): string {
  const source = String(text ?? "");
  if (!turnFrame || !source.trim()) return source;
  const normalizeForDenial = (value: string) =>
    value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[’']/g, " ").toLowerCase();
  // P12-V (probe P12-5 passe 4): la garde couvrait les verbes de CRÉATION —
  // le même refus confabulé sur une MUTATION (« je ne peux pas décaler ça
  // depuis ce chat », zéro effet émis) passait au travers alors que la
  // capacité replace existe (P6-H) et que les tours voisins déplacent.
  const denialPattern =
    /\bje ne (peux|pourrai s?) pas (te |le |la |te le |te la |l |ca )*(creer|poser|programmer|mettre|caler|planifier|decaler|deplacer|avancer|repousser|modifier|changer)\b[^.!?\n]*\b(rappels?|ici|d ici|ca depuis|depuis (le |la |ce )?(chat|conversation))\b|\bje ne peux pas (le|la|ca) (creer|poser|programmer|mettre|caler|decaler|deplacer|avancer|modifier) (ici|depuis (le |ce )?chat)\b/;
  if (!denialPattern.test(normalizeForDenial(source))) return source;
  const context = buildDirectEffectConfirmationContext(turnFrame);
  const hasReminderOutcome = (context?.effects_outcome ?? []).some((outcome) =>
    outcome.effect_type === "create_one_shot_reminder"
  );
  // Un outcome rappel existe (blocked artefact, récurrent, safety…) → le
  // refus est la vérité contractuelle, intact.
  if (hasReminderOutcome) return source;
  const sentences = source.split(/(?<=[.!?\n])/);
  const kept = sentences.filter((sentence) =>
    !denialPattern.test(normalizeForDenial(sentence))
  );
  const cleaned = kept.join("").replace(/[ \t]{2,}/g, " ").trim();
  console.warn(
    "[Router] unfounded reminder-capacity denial stripped (P10-C)",
  );
  logRuntimeGuardEvent({
    guard: "reminder_capacity_denial_stripped",
    userId: (turnFrame as { user_id?: string }).user_id ?? null,
    detail: { turn_id: (turnFrame as { turn_id?: string }).turn_id ?? null },
  });
  const recovery =
    "Pour tes rappels, dis-moi exactement ce que tu veux (lequel, et le moment) et je le fais direct — c'est possible d'ici.";
  return cleaned ? `${cleaned} ${recovery}` : recovery;
}

/**
 * P10-C (alex-hard24 R1-B04): GARDE CLAIM-TRACK-SANS-COMMIT — « Les deux
 * sont pris en compte ✅ » sur un ledger track blocked (committed 0). Armée
 * UNIQUEMENT quand le tour porte un outcome track non-committé et AUCUN
 * commit d'aucun type (un commit coexistant rend un claim légitime possible
 * — co-demande partielle, on ne strippe pas). Le repli est la guidance
 * contractuelle du blocage (« déjà noté aujourd'hui »), jamais le mensonge.
 */
export function stripTrackClaimWithoutCommit(
  text: string,
  turnFrame: TurnFrame | null,
): string {
  const source = String(text ?? "");
  if (!turnFrame || !source.trim()) return source;
  const context = buildDirectEffectConfirmationContext(turnFrame);
  const outcomes = context?.effects_outcome ?? [];
  const trackNonCommitted = outcomes.some((outcome) =>
    outcome.effect_type === "track_progress_plan_item" &&
    (outcome.status === "blocked" || outcome.status === "needs_clarify")
  );
  const anyCommitted = outcomes.some((outcome) =>
    outcome.status === "committed"
  );
  const normalizeForClaim = (value: string) =>
    value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[’']/g, " ").toLowerCase();
  // P12-C (eva-hard25 R1-B01): PARITÉ PAR ITEM — un claim ADDITIF (« j'ai
  // aussi noté ton activité : aquarelle ✅ ») nommant un item SANS commit de
  // CET item est retiré MÊME quand un autre commit coexiste (le trou
  // anyCommitted⇒no-strip de P10-C rendait la garde inopérante par
  // construction sur la co-demande partielle). Borné au marqueur additif
  // explicite dont la phrase ne recouvre AUCUN target_title committé ; les
  // accusés mémoire (« je le garde en tête ») restent exempts.
  {
    const lane = (turnFrame as { direct_effect_lane?: unknown })
      .direct_effect_lane as Record<string, unknown> | null | undefined;
    const committedTrackTitles = (Array.isArray(lane?.committed_effects)
      ? lane?.committed_effects as Array<Record<string, unknown>>
      : [])
      .filter((effect) =>
        String(effect?.type ?? "") === "track_progress_plan_item"
      )
      .map((effect) => normalizeForClaim(String(effect?.target_title ?? "")))
      .filter(Boolean);
    const additiveClaimPattern =
      /\bj ?.?ai aussi (note|coche|enregistre|marque)\b|\best aussi (note|coche|enregistre|marque)e?\b/;
    const memoryExemption = /\b(en tete|memoire|preference|retien|retenu)\b/;
    const hasTrackContext = outcomes.some((outcome) =>
      outcome.effect_type === "track_progress_plan_item"
    );
    if (hasTrackContext) {
      const sentences = source.split(/(?<=[.!?\n])/);
      const kept = sentences.filter((sentence) => {
        const normalizedSentence = normalizeForClaim(sentence);
        if (!additiveClaimPattern.test(normalizedSentence)) return true;
        if (memoryExemption.test(normalizedSentence)) return true;
        const coveredByCommit = committedTrackTitles.some((title) =>
          title.split(/[^a-z0-9]+/).filter((token) => token.length >= 4)
            .some((token) => normalizedSentence.includes(token))
        );
        return coveredByCommit;
      });
      if (kept.length !== sentences.length) {
        console.warn(
          "[Router] additive track claim on uncommitted item stripped (P12-C)",
        );
        logRuntimeGuardEvent({
          guard: "track_claim_without_commit_stripped",
          userId: (turnFrame as { user_id?: string }).user_id ?? null,
          detail: {
            turn_id: (turnFrame as { turn_id?: string }).turn_id ?? null,
            reason: "per_item_additive",
          },
        });
        return kept.join("").replace(/[ \t]{2,}/g, " ").trim() ||
          "Je n'ai noté qu'une partie de ce que tu m'as dit — redis-moi l'autre item et je le coche.";
      }
    }
  }
  if (!trackNonCommitted || anyCommitted) return source;
  const claimPattern =
    /\b(les deux|tous les deux|les trois|tout ca) (sont|est) (bien )?(pris|note|notes|enregistre|enregistres|coche|coches|compte|comptes|marque|marques)\b|\bc ?.?est (note|pris en compte|enregistre|coche|marque) pour (les deux|tous les deux|les trois)\b/;
  if (!claimPattern.test(normalizeForClaim(source))) return source;
  const sentences = source.split(/(?<=[.!?\n])/);
  const kept = sentences.filter((sentence) =>
    !claimPattern.test(normalizeForClaim(sentence))
  );
  const cleaned = kept.join("").replace(/[ \t]{2,}/g, " ").trim();
  console.warn("[Router] track claim without commit stripped (P10-C)");
  logRuntimeGuardEvent({
    guard: "track_claim_without_commit_stripped",
    userId: (turnFrame as { user_id?: string }).user_id ?? null,
    detail: { turn_id: (turnFrame as { turn_id?: string }).turn_id ?? null },
  });
  const blockedGuidance = outcomes.find((outcome) =>
    outcome.effect_type === "track_progress_plan_item" &&
    (outcome.status === "blocked" || outcome.status === "needs_clarify")
  );
  const fallback = String(blockedGuidance?.guidance ?? "").trim() ||
    "Je n'ai rien coché de nouveau sur ce tour — redis-moi exactement quoi noter et je le fais.";
  return cleaned ? cleaned : fallback;
}

/**
 * P8-F (eva-hard23 R1-B04 — résiduel P7 revenu en run réel, décision actée):
 * GARDE DE RENDU claim-avant-clarify. Quand le tour porte un needs_clarify
 * de rappel (pending armé, ZÉRO commit du type), aucune phrase du rendu ne
 * peut affirmer la pose (« Je te le mets pour demain à 07:00 » puis la
 * question du créneau = assertion d'un rappel jamais écrit). Les phrases
 * fautives sont retirées; si tout saute, la question contractuelle de la
 * lane reste (ensureClarifyQuestionVisible la ré-injecte). Jamais activée
 * quand un commit du même type existe (co-demande partielle P8-A: « c'est
 * fait pour jeudi » est VRAI).
 */
export function stripCommitClaimBeforeClarify(
  text: string,
  turnFrame: TurnFrame | null,
  // P12-C (eva-hard25 R1-B03): canal CONTRACTUEL du message user — l'ancien
  // `turnFrame.user_message` n'existe pas au runtime et rendait la branche
  // P10-V inatteignable en prod (la probe passait sur un frame synthétique).
  userMessage?: string,
): string {
  const source = String(text ?? "");
  if (!turnFrame || !source.trim()) return source;
  const context = buildDirectEffectConfirmationContext(turnFrame);
  const outcomes = context?.effects_outcome ?? [];
  const reminderClarify = outcomes.some((outcome) =>
    outcome.effect_type === "create_one_shot_reminder" &&
    outcome.status === "needs_clarify"
  );
  // P9-C (alex-hard24 R1-B01): la garde couvre aussi le BLOCKED — un
  // reschedule mal classé bloqué duplicate_pending sortait « le rappel de
  // 22h est bien décalé à jeudi » avec un ledger à zéro commit. Le différé
  // safety est exempté: son « je le garde pour après » est la vérité
  // contractuelle du blocage, pas un claim de pose.
  const reminderBlockedNonDeferred = outcomes.some((outcome) =>
    outcome.effect_type === "create_one_shot_reminder" &&
    outcome.status === "blocked" &&
    !/safety|defer/i.test(String(outcome.reason_code ?? ""))
  );
  const reminderCommitted = outcomes.some((outcome) =>
    outcome.effect_type === "create_one_shot_reminder" &&
    outcome.status === "committed"
  );
  // P10-V (probe P10-4 passe 1): ZÉRO outcome rappel + le user a demandé un
  // DÉPLACEMENT (« avance le a 12h ») + le rendu affirme la mutation
  // (« c'est fait… à la place de 12h30 ») — le dispatcher n'avait rien émis,
  // aucune lane n'a tourné, le claim est faux par construction. Borné aux
  // verbes de MUTATION des deux côtés: les readouts légitimes (« ton rappel
  // est posé pour demain ») restent intacts.
  const noReminderOutcome = !outcomes.some((outcome) =>
    outcome.effect_type === "create_one_shot_reminder"
  );
  const normalizeForClaimEarly = (value: string) =>
    value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[’']/g, " ").toLowerCase();
  const userMessageText = String(
    userMessage ??
      (turnFrame as { user_message?: string }).user_message ?? "",
  );
  const userAskedReminderMutation =
    /\b(decale|avance|repousse|replanifie|reprogramme|remets|mets)[- ]?(le|la|les)?\b/
      .test(normalizeForClaimEarly(String(userMessageText))) &&
    /\b(\d{1,2}\s?h(\d{2})?|au lieu de|a la place|plus tot|plus tard|demain|ce soir)\b/
      .test(normalizeForClaimEarly(String(userMessageText)));
  const mutationClaimPattern =
    /\b(decale|deplace|avance|repousse|replanifie|reprogramme)e?s?\b|\bc ?.?est (fait|bon)\b[^.!?\n]{0,80}\b(a la place de|au lieu de)\b/;
  const unfoundedMutationClaim = noReminderOutcome &&
    userAskedReminderMutation &&
    mutationClaimPattern.test(normalizeForClaimEarly(source));
  if (
    (!reminderClarify && !reminderBlockedNonDeferred &&
      !unfoundedMutationClaim) || reminderCommitted
  ) {
    return source;
  }
  if (unfoundedMutationClaim && !reminderClarify && !reminderBlockedNonDeferred) {
    const sentencesEarly = source.split(/(?<=[.!?\n])/);
    const keptEarly = sentencesEarly.filter((sentence) =>
      !mutationClaimPattern.test(normalizeForClaimEarly(sentence))
    );
    const cleanedEarly = keptEarly.join("").replace(/[ \t]{2,}/g, " ").trim();
    console.warn(
      "[Router] reminder mutation claim without any outcome stripped (P10-V)",
    );
    logRuntimeGuardEvent({
      guard: "mutation_claim_without_outcome_stripped",
      userId: (turnFrame as { user_id?: string }).user_id ?? null,
      detail: { turn_id: (turnFrame as { turn_id?: string }).turn_id ?? null },
    });
    return cleanedEarly ||
      "Je n'ai rien changé sur tes rappels pour l'instant — redis-moi lequel déplacer et vers quel créneau, et je le fais.";
  }
  // P9-C: participes de mutation ajoutés (décalé/déplacé/avancé/repoussé/
  // replanifié/reprogrammé/calé) + mots intercalés tolérés (« le rappel DE
  // 22H est BIEN décalé ») — le motif exact ratait toute variante.
  const claimPattern =
    /\bje (te |le |la |te le |te la |l )?(mets|pose|programme|cale|note|garde|decale|deplace|avance|repousse|replanifie|reprogramme)\b|\bc ?.?est (bien |deja |desormais |donc )?(fait|pose|posé|programme|programmé|cale|calé|note|noté|pris|enregistre|enregistré|garde|gardé|decale|décalé|deplace|déplacé|avance|avancé|repousse|repoussé|replanifie|replanifié|reprogramme|reprogrammé)\b|\bje l ?.?ai (bien |deja )?(pose|posé|programme|programmé|cree|créé|mis|note|noté|garde|gardé|gardée|decale|décalé|deplace|déplacé|avance|avancé|repousse|repoussé|replanifie|replanifié|reprogramme|reprogrammé)\b|\b(rappel|il|elle)(?: [a-z0-9:]{1,12}){0,4} est (bien |deja |desormais |maintenant )?(pose|posé|programme|programmé|cree|créé|enregistre|enregistré|garde|gardé|gardée|cale|calé|decale|décalé|deplace|déplacé|avance|avancé|repousse|repoussé|replanifie|replanifié|reprogramme|reprogrammé)\b/;
  const normalizeForClaim = (value: string) =>
    value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[’']/g, " ").toLowerCase();
  if (!claimPattern.test(normalizeForClaim(source))) return source;
  const sentences = source.split(/(?<=[.!?\n])/);
  const kept = sentences.filter((sentence) =>
    !claimPattern.test(normalizeForClaim(sentence))
  );
  const cleaned = kept.join("").replace(/[ \t]{2,}/g, " ").trim();
  console.warn(
    "[Router] commit-claim stripped on a needs_clarify reminder turn (P8-F)",
  );
  logRuntimeGuardEvent({
    guard: "commit_claim_stripped",
    userId: (turnFrame as { user_id?: string }).user_id ?? null,
    detail: {
      turn_id: (turnFrame as { turn_id?: string }).turn_id ?? null,
      reason: reminderClarify ? "needs_clarify" : "blocked",
    },
  });
  // Si tout le texte portait le claim, la question contractuelle de la lane
  // (clarify_question) reste la réponse — jamais un claim, jamais un vide.
  // P12-G (nina-p10reval R1-B05): le strip emportait la RELANCE d'un blocked
  // past_time (« un autre horaire, ou demain ? ») pourtant présente dans
  // visible_confirmation_hint — invariant H3/O3 étendu au chemin strippé:
  // si le texte restant a perdu toute question, la question de la lane est
  // ré-appendue.
  const laneHint = String(
    ((turnFrame as { direct_effect_lane?: { visible_confirmation_hint?: unknown } })
      .direct_effect_lane?.visible_confirmation_hint) ?? "",
  ).trim();
  if (cleaned && !cleaned.includes("?") && laneHint.includes("?")) {
    return `${cleaned}\n\n${laneHint}`;
  }
  if (cleaned) return cleaned;
  const clarify = outcomes.find((outcome) =>
    outcome.effect_type === "create_one_shot_reminder" &&
    outcome.status === "needs_clarify" &&
    String(outcome.clarify_question ?? "").trim()
  );
  if (String(clarify?.clarify_question ?? "").trim()) {
    return String(clarify?.clarify_question ?? "").trim();
  }
  // P9-C: un BLOCKED sans question contractuelle ne peut pas retomber sur le
  // texte fautif (le claim reviendrait) — repli déterministe honnête.
  // P12-V (harness S2 T4): le hint de la lane (l'état RÉEL du blocage, ex.
  // « il est déjà calé à 23h — rien à changer ») prime sur le repli
  // générique : le strip est honnête mais un repli sans contexte laissait
  // l'utilisateur sans l'état de son rappel.
  if (laneHint) return laneHint;
  return "Je n'ai rien changé sur tes rappels pour l'instant — redis-moi exactement ce que tu veux et je le fais.";
}

/**
 * P7-F (rose-untested22 R1-B05): GARDE DE COHÉRENCE DE SCRIPT — un artefact
 * de génération peut injecter un token d'un alphabet étranger en pleine
 * phrase française (« je n'ai pas de पुष्टि ici », devanagari). Garde
 * d'intégrité du renderer, non sémantique: les mots portés par un script
 * hors latin/grec/emoji sont retirés (le résidu reste plus lisible que le
 * charabia). Fail-open: si le strip vide la réponse, on rend l'original.
 */
export function stripForeignScriptTokens(text: string): string {
  const source = String(text ?? "");
  // Lettres hors scripts attendus (latin + signes communs). Les emoji,
  // symboles, ponctuation et chiffres ne sont pas des \p{L}: intacts.
  const foreignLetter = /[\p{L}]/u;
  const allowedLetter = /[\p{Script=Latin}\p{Script=Greek}]/u;
  const hasForeign = [...source].some((char) =>
    foreignLetter.test(char) && !allowedLetter.test(char)
  );
  if (!hasForeign) return source;
  const cleaned = source
    .split(/(\s+)/)
    .filter((token) =>
      !(
        [...token].some((char) =>
          foreignLetter.test(char) && !allowedLetter.test(char)
        )
      )
    )
    .join("")
    .replace(/[ \t]{2,}/g, " ");
  if (!cleaned.trim()) return source;
  console.warn("[Router] foreign-script tokens stripped from visible text");
  return cleaned;
}

/**
 * P2-2 (nina-untested R1-B02, rose-lifecycle R1-B05): un outcome
 * needs_clarify d'un tool skill DOIT aboutir à une question visible — le
 * composeur la supprimait (« reste seulement signalée, pas confirmée »),
 * rendant la boucle de ré-armement 3g inarmable, ou pire, AFFIRMAIT l'effet
 * (verify rose T15). Reformuler est permis (toute question compte) ;
 * supprimer non : la question contractuelle de la lane est ré-injectée.
 */
export function ensureClarifyQuestionVisible(
  text: string,
  turnFrame: TurnFrame | null,
): string {
  if (!turnFrame || text.includes("?")) return text;
  const context = buildDirectEffectConfirmationContext(turnFrame);
  const clarify = (context?.effects_outcome ?? []).find((outcome) =>
    outcome.status === "needs_clarify" &&
    String(outcome.clarify_question ?? "").trim().length > 0
  );
  if (!clarify) return text;
  return `${text.trim()}\n\n${String(clarify.clarify_question).trim()}`;
}
