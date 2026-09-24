// ═══════════════════════════════════════════════════════════════════════════
// L'INTENTION « RESCHEDULE » : DÉPLACER UN RAPPEL PONCTUEL
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `router.ts` (découpage des gros fichiers,
// lot 5b). Le bloc est le texte d'origine, à l'indentation d'origine ; seules
// la signature, les lignes qui lisent l'état au début et celles qui le
// rendent à la fin sont nouvelles. Ce module n'importe jamais `router.ts`.
//
// Rend un résultat quand le déplacement se conclut ici (remplacement,
// blocage, question). Rend `null` quand il retombe en création : il a
// alors recopié dans `st` ses valeurs de `createEffect`, `compiledPayload`
// et `allowDuplicateForTurn`, que `router.ts` reprend avant la suite.

import type { OneShotReminderDirectEffectResult } from "./contract.ts";
import type {
  OneShotReminderIntentState,
  OneShotReminderLaneArgs,
} from "./intent_state.ts";
import {
  daypartWindowFromReference,
  isReminderEntityReference,
  isReminderInstructionInvarianceAnaphora,
} from "./instruction_parser.ts";
import {
  readPendingOneShotReminderRows,
  readRecentOneShotReminderRows,
} from "./persistence.ts";
import {
  localHHMMForScheduledFor,
  parseOneShotReminderRequest,
  parseScheduledForFromMessage,
} from "./time_parser.ts";
import { getUserTimeContext } from "../../../../_shared/user_time_context.ts";
import {
  composeNamedDayWithHHMM,
  entityAnchoredDayToken,
  hasRescheduleCliticAnaphor,
  instructionRootedInText,
  instructionTokensOverlap,
  localWeekdayName,
  messageContentOverlapScore,
  oneShotInstructionTokens,
} from "./text_signals.ts";
import {
  baseDirectEffectResult,
  canonicalRawTextFromTurnFrame,
  canonicalWhenHintFromTurnFrame,
  formatOneShotLocalLabel,
  payloadText,
} from "./payload_compile.ts";

export async function runRescheduleIntent(
  args: OneShotReminderLaneArgs,
  st: Pick<
    OneShotReminderIntentState,
    "createEffect"
    | "compiledPayload"
    | "allowDuplicateForTurn"
    | "now"
    | "additiveMarker"
    | "effectType"
    | "completeMissingPayloadTime"
  >,
): Promise<OneShotReminderDirectEffectResult | null> {
  let { createEffect, compiledPayload, allowDuplicateForTurn } = st;
  const { now, additiveMarker, effectType, completeMissingPayloadTime } = st;
  // Intention reschedule (eva-r5 B01): un decalage de rappel existant n'est
  // pas supporte en chat (decision V1). Comme pour cardinality=recurring, le
  // dispatcher emet l'intent et on bloque ICI pour que le tour porte un
  // outcome honnete — un tour "sans effet" laissait le composeur improviser
  // un faux "c'est note : 21h30" sans aucun outcome a suivre.
  if (payloadText(createEffect, "intent") === "reschedule") {
    // P0-4 (nina R1-B02): « remets-le à 21h30 » alors qu'AUCUN rappel
    // ponctuel n'est en attente = il n'y a rien à déplacer — l'intention
    // réelle est de (re)poser le rappel. Payload complet → on dégrade en
    // create (fallthrough vers le chemin nominal) ; incomplet → clarify
    // honnête SANS proposer le replace (consigne inexécutable sans cible).
    // Lecture indisponible → comportement historique (blocage honnête).
    let pendingCount: number | null = null;
    let pendingRows: Awaited<
      ReturnType<typeof readPendingOneShotReminderRows>
    > | null = null;
    try {
      pendingRows = await readPendingOneShotReminderRows({
        supabase: args.supabase,
        userId: args.userId,
      });
      pendingCount = pendingRows.length;
    } catch (_error) {
      pendingCount = null;
    }
    // P4-C (paul-p3verify R1-B03): « remets-moi le rappel des pâtes » alors
    // que les pendings existants ne correspondent PAS à cette instruction
    // (seul le kiné est en attente) — il n'y a rien à déplacer pour CE
    // rappel, l'intention réelle est de le (re)poser: même dégradation en
    // create que le cas zéro-pending. Match déterministe par recouvrement
    // de tokens d'instruction (jamais le texte du message).
    // P6-V (harness r5g-s2 T3): un instruction_hint qui ÉCHO la commande de
    // déplacement (verbe de déplacement + horaire, ex. « en fait mets-le
    // plutôt à 23h, 22h30 c'est trop tôt ») n'est PAS un contenu de rappel:
    // le prendre pour l'objet faisait rater le recouvrement de tokens →
    // dégradation en create → DOUBLON avec la commande committée en durable.
    // Écho ⇒ instruction absente: le ciblage P6-H (pending unique) prend la
    // main et le contenu s'hérite du rappel déplacé. « remets-moi le rappel
    // des pâtes » (P4-C) reste une dégradation: objet réel, pas d'horaire.
    const rawRequestedInstruction = compiledPayload.instruction ?? "";
    const looksLikeRescheduleCommandEcho = (() => {
      const normalized = rawRequestedInstruction.normalize("NFD")
        .replace(/\p{Diacritic}/gu, "").toLowerCase();
      return /\b(mets|remets|remet|d[ée]?cale|decale|repousse|replanifie|reprogramme|recree|avance)\b/
        .test(normalized) &&
        /\b\d{1,2}\s?h(?:\d{2})?\b/.test(normalized);
    })();
    // P10-E (alex-hard24 R1-B02): une RÉFÉRENCE D'ENTITÉ (« celui du midi »)
    // n'est pas un contenu — traitée comme instruction vide (l'héritage
    // P3-F prendra le texte de la cible), son créneau nominal sert à
    // résoudre la cible parmi plusieurs pendings.
    // P12-V (probe P12-5 passe 6): la référence de créneau vit parfois dans
    // le MESSAGE (« décale celui du soir à 21h ») pendant que l'émission
    // INVENTE une instruction discriminante (« faire mes étirements »,
    // absente du message) — le faux discriminant résolvait une cible AU
    // HASARD parmi les candidats du créneau. Quand le message porte la
    // référence nominale et que l'instruction émise n'y est PAS ancrée,
    // l'instruction ne cible pas : le créneau nominal (D5) prend la main
    // (1 candidat = cible, ≥2 = clarify nominative). Condition de
    // désarmement : instruction ancrée dans le message = émission fidèle ⇒
    // ciblage par contenu inchangé.
    const messageDaypartReference = `${args.message}`.normalize("NFD")
      .replace(/\p{Diacritic}/gu, "").toLowerCase()
      .match(
        /\b(celui|celle) (du (matin|midi|soir)|de la nuit|de l apres[- ]midi)\b/,
      )?.[0] ?? null;
    const emittedInstructionUnrootedOnDaypartMessage = Boolean(
      messageDaypartReference && rawRequestedInstruction &&
        !isReminderEntityReference(rawRequestedInstruction) &&
        !instructionRootedInText(
          rawRequestedInstruction,
          `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`,
        ),
    );
    const rescheduleEntityReference = isReminderEntityReference(
      rawRequestedInstruction,
    )
      ? rawRequestedInstruction
      : emittedInstructionUnrootedOnDaypartMessage
      ? messageDaypartReference
      : null;
    const requestedInstruction =
      looksLikeRescheduleCommandEcho || rescheduleEntityReference
        ? ""
        : rawRequestedInstruction;
    // P6-V (harness r5g-s2 T3, 2e forme): l'émission pollue parfois
    // instruction_hint avec un contenu SANS RAPPORT (sujet du tour
    // précédent) — le non-recouvrement dégradait alors en create → doublon.
    // Le discriminant grammatical est déterministe: l'impératif + clitique
    // à TRAIT D'UNION (« mets-le », « décale-le », « remets-la ») désigne
    // toujours UN RAPPEL EXISTANT — jamais une re-création. « remets-moi le
    // rappel des pâtes » (NP, pas de clitique) reste la dégradation P4-C.
    const rescheduleCliticAnaphor = hasRescheduleCliticAnaphor(
      `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`,
    );
    const anyPendingMatchesInstruction = pendingRows?.some((row) =>
      instructionTokensOverlap(
        requestedInstruction,
        String(
          (row?.message_payload as Record<string, unknown> | undefined)
            ?.reminder_instruction ?? "",
        ),
      )
    ) ?? true;
    // P9-A (rose-p8reval T6) — CONDITION D'ANTÉCÉDENT RÉSOLUBLE: le clitique
    // ne protège la voie P6-H que si l'anaphore PEUT viser un pending. Quand
    // l'utilisateur redonne dans le message même un contenu complet qui ne
    // recouvre AUCUN pending (« reprends celui-là… le 16 à 20h pour checker
    // mon envie » alors que seul « préparer le sas » est en attente),
    // l'antécédent du pronom est la SPEC qu'il vient d'énoncer — pas « le
    // seul pending qui traîne ». Coercer quand même le replace annulait un
    // rappel sain, héritait son texte et affirmait le contraire (3 dégâts
    // silencieux). Le contenu ancré dans le message désarme la ceinture: la
    // demande redevient un create additif (payload complet) ou un clarify.
    // La pollution P6-V 2e forme (instruction héritée d'un tour précédent,
    // absente du message) reste couverte: non ancrée ⇒ ciblage P6-H inchangé.
    const instructionRootedInMessage = instructionRootedInText(
      requestedInstruction,
      `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`,
    );
    // P12-D4 (nina-p10reval R1-B03a): condition P9-A étendue d'une dimension
    // JOUR — « il manque celui de VENDREDI, remets-le » avec pendings
    // jeudi-seulement: l'antécédent nommé (vendredi) n'existe pas en pending,
    // l'anaphore ne peut PAS viser un pending d'un autre jour → dégradation
    // en create, jamais un replace du jeudi lexicalement proche.
    // Condition de désarmement: le jour nommé est celui de DESTINATION
    // (« décale-le À vendredi », non capturé par l'ancre d'entité) ou un
    // pending existe bien ce jour-là ⇒ ciblage historique inchangé; lecture
    // timezone indisponible ⇒ fail-open historique.
    const rescheduleEntityDayToken = entityAnchoredDayToken(
      `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`,
    );
    let entityDayHasPendingMatch = true;
    if (rescheduleEntityDayToken && (pendingRows ?? []).length > 0) {
      try {
        const tctxEntityDay = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const timezoneEntityDay = tctxEntityDay.user_timezone ||
          "Europe/Paris";
        const civilOf = (iso: string) => {
          try {
            return new Intl.DateTimeFormat("fr-CA", {
              timeZone: timezoneEntityDay,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(iso));
          } catch (_error) {
            return "";
          }
        };
        const dayTokenMatchesIso = (iso: string): boolean => {
          if (!iso) return false;
          if (
            rescheduleEntityDayToken === "demain" ||
            rescheduleEntityDayToken.startsWith("apres")
          ) {
            const offset = rescheduleEntityDayToken === "demain" ? 1 : 2;
            return civilOf(iso) ===
              civilOf(
                new Date(
                  new Date(tctxEntityDay.now_utc).getTime() +
                    offset * 86_400_000,
                ).toISOString(),
              );
          }
          return localWeekdayName(iso, timezoneEntityDay) ===
            rescheduleEntityDayToken;
        };
        entityDayHasPendingMatch = (pendingRows ?? []).some((row) =>
          dayTokenMatchesIso(String(row?.scheduled_for ?? ""))
        );
      } catch (_error) {
        entityDayHasPendingMatch = true;
      }
    }
    const entityDayMismatch = Boolean(rescheduleEntityDayToken) &&
      !entityDayHasPendingMatch;
    // P12-D3 (nina-p10reval R1-B03b): marqueur additif explicite (« rajoute
    // jeudi et tu gardes vendredi ») ⇒ le chemin reschedule/replace perd le
    // droit de CANCEL — dégradation en create (doublon assumé), jamais un
    // replace silencieux de la cible protégée.
    const nothingToRescheduleForThisReminder = additiveMarker ||
      entityDayMismatch ||
      pendingCount === 0 ||
      (pendingCount !== null &&
        oneShotInstructionTokens(requestedInstruction).size > 0 &&
        !anyPendingMatchesInstruction &&
        // Clitique anaphorique ⇒ le user déplace UN RAPPEL EXISTANT: jamais
        // de dégradation en create (le doublon), le ciblage P6-H tranche
        // (pending unique → replace atomique, sinon blocage honnête) — SAUF
        // antécédent non résoluble avec contenu ancré (P9-A ci-dessus).
        (!rescheduleCliticAnaphor || instructionRootedInMessage));
    if (nothingToRescheduleForThisReminder) {
      compiledPayload = await completeMissingPayloadTime({ createEffect, compiledPayload });
      // P12-D3/D4: le doublon d'instruction est ASSUMÉ sur ces dégradations
      // (l'objet existe déjà un autre jour et doit RESTER) — sans ça le gate
      // same_instruction_pending re-bloquait le create légitime.
      if (additiveMarker || entityDayMismatch) allowDuplicateForTurn = true;
      // P10-E/P12-D4/D8a: une référence d'entité (« celui des poubelles »)
      // ou une anaphore d'invariance n'est JAMAIS un contenu durable — sur
      // la dégradation en create elle vaut instruction ABSENTE, l'héritage
      // (sibling D4, cancelled D8a) ou le clarify prennent la suite.
      if (
        compiledPayload.instruction &&
        (isReminderEntityReference(compiledPayload.instruction) ||
          isReminderInstructionInvarianceAnaphora(compiledPayload.instruction))
      ) {
        compiledPayload = { ...compiledPayload, instruction: null };
      }
      // P12-D4 (nina R1-B03a): unique pending du même objet sur un AUTRE
      // jour ⇒ create PUR du jour nommé — instruction héritée du sibling,
      // heure héritée si le message n'en donne pas (la série « jeudi et
      // vendredi à 18h » partage son heure).
      if (entityDayMismatch && (pendingRows ?? []).length === 1) {
        const sibling = (pendingRows ?? [])[0];
        const siblingInstruction = String(
          (sibling?.message_payload as Record<string, unknown> | undefined)
            ?.reminder_instruction ?? "",
        ).trim();
        if (!compiledPayload.instruction && siblingInstruction) {
          compiledPayload = {
            ...compiledPayload,
            instruction: siblingInstruction,
          };
        }
        const messageHasExplicitHour = /\b\d{1,2}\s*h(?:\d{2})?\b/.test(
          String(args.message ?? "").normalize("NFD")
            .replace(/\p{Diacritic}/gu, "").toLowerCase(),
        );
        if (!compiledPayload.scheduledFor && !messageHasExplicitHour) {
          try {
            const tctxSibling = await getUserTimeContext({
              supabase: args.supabase,
              userId: args.userId,
              now,
            });
            const timezoneSibling = tctxSibling.user_timezone ||
              "Europe/Paris";
            const siblingHHMM = localHHMMForScheduledFor(
              String(sibling?.scheduled_for ?? ""),
              timezoneSibling,
            );
            const composed = siblingHHMM
              ? composeNamedDayWithHHMM({
                dayToken: rescheduleEntityDayToken!,
                hhmm: siblingHHMM,
                timezone: timezoneSibling,
                nowUtcIso: tctxSibling.now_utc,
              })
              : null;
            if (composed) {
              compiledPayload = {
                ...compiledPayload,
                scheduledFor: composed,
                localLabel: formatOneShotLocalLabel(
                  composed,
                  timezoneSibling,
                ),
              };
            }
          } catch (_error) {
            // best-effort: le clarify honnête reste le filet.
          }
        }
      }
      // P12-D8a (paul-p9reval R1-B03): héritage d'instruction étendu aux
      // CANCELLED récents (fenêtre 24h) — « remets-moi celui des poubelles »
      // après un cancel hérite le texte de la ligne annulée quand l'entité
      // nommée est UNIQUE parmi les annulés; ≥2 candidats distincts ⇒
      // clarify nominatif; aucun ⇒ comportement P0-4 inchangé. L'issue reste
      // NON destructive (create pur, invariant P9-A: aucun pending touché).
      if (!compiledPayload.instruction) {
        try {
          const sinceIso = new Date(now.getTime() - 24 * 3_600_000)
            .toISOString();
          const recentRows = await readRecentOneShotReminderRows({
            supabase: args.supabase,
            userId: args.userId,
            sinceIso,
          });
          const cancelledScored = (recentRows as Array<
            Record<string, unknown>
          >)
            .filter((row) => String(row?.status ?? "") === "cancelled")
            .map((row) => ({
              row,
              instruction: String(
                (row?.message_payload as Record<string, unknown> | undefined)
                  ?.reminder_instruction ?? "",
              ).trim(),
            }))
            .filter((entry) =>
              entry.instruction &&
              messageContentOverlapScore(
                `${args.message} ${rawRequestedInstruction}`,
                entry.instruction,
              ) > 0
            );
          const distinctInstructions = [
            ...new Set(
              cancelledScored.map((entry) =>
                entry.instruction.normalize("NFD")
                  .replace(/\p{Diacritic}/gu, "").toLowerCase()
              ),
            ),
          ];
          if (cancelledScored.length > 0 && distinctInstructions.length === 1) {
            compiledPayload = {
              ...compiledPayload,
              instruction: cancelledScored[0].instruction,
            };
          } else if (distinctInstructions.length >= 2) {
            const tctxCancelled = await getUserTimeContext({
              supabase: args.supabase,
              userId: args.userId,
              now,
            });
            const timezoneCancelled = tctxCancelled.user_timezone ||
              "Europe/Paris";
            const candidateLines = cancelledScored.map((entry) =>
              `« ${entry.instruction} » (${
                formatOneShotLocalLabel(
                  String(entry.row?.scheduled_for ?? ""),
                  timezoneCancelled,
                )
              })`
            );
            const cancelledClarifyReply =
              `Tu as eu plusieurs rappels annulés qui pourraient correspondre : ${
                candidateLines.join(" ; ")
              }. Lequel je te remets ?`;
            return {
              ...baseDirectEffectResult({
                detected: true,
                intent: "create",
                status: "needs_clarify",
                reason_code: "cancelled_antecedent_ambiguous",
                reply: cancelledClarifyReply,
              }),
              requested_effects: [{
                type: effectType,
                reason_code: "reschedule",
              }],
              blocked_effects: [{
                type: effectType,
                reason_code: "cancelled_antecedent_ambiguous",
              }],
              missing_slots: ["reminder_instruction"],
              pending_clarification: {
                intent: "create",
                reason_code: "cancelled_antecedent_ambiguous",
                clarify_question: cancelledClarifyReply,
                known_slots: {
                  UTC_time: compiledPayload.scheduledFor ?? null,
                  local_label: compiledPayload.localLabel ?? null,
                  instruction_hint: null,
                  raw_text: compiledPayload.rawText ?? args.message,
                  when_hint:
                    canonicalWhenHintFromTurnFrame(args.turnFrame) ?? null,
                },
              },
            };
          }
        } catch (_error) {
          // Lecture best-effort: le clarify P0-4 historique reste le filet.
        }
      }
      if (!compiledPayload.scheduledFor || !compiledPayload.instruction) {
        // P9-A: le préambule dit la vérité de l'inventaire — « aucun rappel
        // en attente » seulement quand c'est le cas; des pendings SANS
        // RAPPORT existants ⇒ « aucun rappel qui corresponde » (jamais nier
        // l'inventaire, jamais y toucher). P12-D3: sur un ajout explicite,
        // le préambule dit l'ajout (rien d'existant n'est en cause).
        const noTargetPreamble = additiveMarker
          ? "C'est bien un ajout — je ne touche à aucun rappel existant."
          : (pendingCount ?? 0) > 0
          ? "Je ne vois pas de rappel en attente qui corresponde à celui-là — je n'ai touché à rien."
          : "Il n'y a aucun rappel en attente à déplacer.";
        return {
          ...baseDirectEffectResult({
            detected: true,
            intent: "create",
            status: "needs_clarify",
            reason_code: "reschedule_no_target",
            reply: !compiledPayload.scheduledFor
              ? `${noTargetPreamble} Donne-moi l'heure exacte et je te le (re)pose direct.`
              : `${noTargetPreamble} Dis-moi ce que je dois te rappeler et je te le (re)pose direct.`,
          }),
          requested_effects: [{ type: effectType, reason_code: "reschedule" }],
          blocked_effects: [{
            type: effectType,
            reason_code: "reschedule_no_target",
          }],
          missing_slots: !compiledPayload.scheduledFor
            ? ["scheduled_for"]
            : ["reminder_instruction"],
        };
      }
      // Payload complet: dégrade en create — le chemin nominal prend la suite.
    } else {
      // P6-H (nina-untested21 R1-B04, DÉCISION ACTÉE 13/07 — renverse V1
      // « pas d'édition en place »): un reschedule à HAUTE CONFIANCE (cible
      // UNIQUE résoluble + nouvelle heure parseable) s'exécute comme la
      // séquence atomique cancel+create du REPLACE, avec toutes ses gardes
      // (correspondance, tout-ou-rien, héritage d'instruction P3-F/P6-A).
      // Ambigu (plusieurs pendings sans correspondance) ou heure manquante →
      // blocage honnête historique, workaround guidé inchangé.
      compiledPayload = await completeMissingPayloadTime({ createEffect, compiledPayload });
      const matchingRows = (pendingRows ?? []).filter((row) =>
        instructionTokensOverlap(
          requestedInstruction,
          String(
            (row?.message_payload as Record<string, unknown> | undefined)
              ?.reminder_instruction ?? "",
          ),
        )
      );
      // P9-A (défense en profondeur): le repli « pending unique » exige un
      // antécédent résoluble — un contenu ancré dans le message qui ne
      // recouvre pas ce pending désigne un AUTRE rappel: cible nulle ⇒
      // blocage honnête en aval, jamais un replace destructif du pending
      // non lié.
      const uniquePendingIsResolvableAntecedent = !(
        oneShotInstructionTokens(requestedInstruction).size > 0 &&
        instructionRootedInMessage &&
        !anyPendingMatchesInstruction
      );
      // P12-D7 (alex-untested24 R1-B06, principe P5-E): cible par ÉVIDENCE
      // NOMMÉE — quand l'instruction émise est vide (écho de commande,
      // référence d'entité), le contenu nommé dans le MESSAGE résout la
      // cible: un recouvrement UNIQUE = cible, sans exiger son heure
      // actuelle. Condition de désarmement: ≥2 candidats positifs = vraie
      // ambiguïté (clarify nominatif), jamais une devinette.
      const messageContentMatches = matchingRows.length === 1
        ? []
        : (pendingRows ?? [])
          .map((row) => ({
            row,
            score: messageContentOverlapScore(
              args.message,
              String(
                (row?.message_payload as Record<string, unknown> | undefined)
                  ?.reminder_instruction ?? "",
              ),
            ),
          }))
          .filter((entry) => entry.score > 0);
      // P10-E: cible par CRÉNEAU NOMINAL — « celui du midi » avec plusieurs
      // pendings résout l'unique pending de la fenêtre (11-15h) ; 0 ou ≥2
      // candidats = pas de cible (jamais un choix au hasard).
      // P12-D5 (alex-untested24 R1-B02/B10): les candidats de la fenêtre sont
      // CAPTURÉS — ≥2 ⇒ clarify nominative qui les énumère; fenêtre VIDE ⇒
      // constat honnête + inventaire réel, JAMAIS le repli « pending unique »
      // hors fenêtre (la supposition observée).
      let daypartRescheduleTarget:
        | Awaited<ReturnType<typeof readPendingOneShotReminderRows>>[number]
        | null = null;
      let daypartCandidates:
        | Awaited<ReturnType<typeof readPendingOneShotReminderRows>>
        | null = null;
      const rescheduleDaypart = rescheduleEntityReference
        ? daypartWindowFromReference(rescheduleEntityReference)
        : null;
      if (rescheduleDaypart && (pendingRows ?? []).length > 0) {
        try {
          const tctxDaypart = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now,
          });
          const timezoneDaypart = tctxDaypart.user_timezone || "Europe/Paris";
          const inWindow = (pendingRows ?? []).filter((row) => {
            const hhmm = localHHMMForScheduledFor(
              String(row?.scheduled_for ?? ""),
              timezoneDaypart,
            );
            const hour = Number(String(hhmm ?? "").split(":")[0]);
            return Number.isFinite(hour) &&
              hour >= rescheduleDaypart.startHour &&
              hour < rescheduleDaypart.endHour;
          });
          daypartCandidates = inWindow;
          if (inWindow.length === 1) daypartRescheduleTarget = inWindow[0];
        } catch (_error) {
          // best-effort: sans résolution, le blocage honnête reste.
          daypartCandidates = null;
        }
      }
      const uniqueRescheduleTarget = matchingRows.length === 1
        ? matchingRows[0]
        : daypartRescheduleTarget
        ? daypartRescheduleTarget
        : messageContentMatches.length === 1
        ? messageContentMatches[0].row
        : (pendingRows ?? []).length === 1 &&
            uniquePendingIsResolvableAntecedent &&
            daypartCandidates === null
        ? (pendingRows ?? [])[0]
        : null;
      // P12-D5: fenêtre nominale calculée mais cible non unique — la lane
      // répond NOMINATIVEMENT (créneau + objet de chaque candidat, jamais
      // « donne-moi l'intitulé exact » ni du vocabulaire système) et arme un
      // pending replace pour que la réponse (contenu ou heure) résolve la
      // cible via la fusion D1.
      if (!uniqueRescheduleTarget && daypartCandidates !== null) {
        try {
          const tctxNominative = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now,
          });
          const timezoneNominative = tctxNominative.user_timezone ||
            "Europe/Paris";
          const nominativeLine = (
            row: Awaited<
              ReturnType<typeof readPendingOneShotReminderRows>
            >[number],
          ) => {
            const rowInstruction = String(
              (row?.message_payload as Record<string, unknown> | undefined)
                ?.reminder_instruction ?? "",
            ).trim() || "rappel ponctuel";
            const rowHHMM = localHHMMForScheduledFor(
              String(row?.scheduled_for ?? ""),
              timezoneNominative,
            );
            return `« ${rowInstruction} » à ${rowHHMM ?? "?"}`;
          };
          const nominativeReply = daypartCandidates.length >= 2
            ? `Tu as ${daypartCandidates.length} rappels sur ce créneau : ${
              daypartCandidates.map(nominativeLine).join(", ")
            } — lequel je déplace ? Rien n'a été changé pour l'instant.`
            : `Je ne vois aucun rappel en attente sur ce créneau. Voilà ce que tu as : ${
              (pendingRows ?? []).map(nominativeLine).join(" ; ") || "aucun"
            }. Dis-moi lequel tu vises — rien n'a été changé.`;
          const nominativeReason = daypartCandidates.length >= 2
            ? "replace_target_ambiguous"
            : "reschedule_no_target";
          return {
            ...baseDirectEffectResult({
              detected: true,
              intent: "create",
              status: "needs_clarify",
              reason_code: nominativeReason,
              reply: nominativeReply,
            }),
            requested_effects: [{
              type: effectType,
              reason_code: "reschedule",
            }],
            blocked_effects: [{
              type: effectType,
              reason_code: nominativeReason,
            }],
            pending_clarification: {
              intent: "replace",
              reason_code: "replace_target_ambiguous",
              clarify_question: nominativeReply,
              known_slots: {
                UTC_time: compiledPayload.scheduledFor ?? null,
                local_label: compiledPayload.localLabel ?? null,
                instruction_hint: null,
                replace_target_label: null,
              },
            },
          };
        } catch (_error) {
          // best-effort: le blocage honnête historique reste le filet.
        }
      }
      // P9-C (alex-hard24 R1-B01): « décale-le à jeudi, même heure » — le
      // créneau du nouveau rappel se compose du JOUR NOMMÉ du message et de
      // l'HEURE HÉRITÉE de la cible (invariance d'heure demandée
      // explicitement). Exception EXPLICITE au verrou P6-V « l'heure de la
      // cible ne complète jamais le nouveau »: ce verrou vise les textes à
      // deux heures où la mauvaise gagne; ici l'utilisateur demande
      // littéralement la même heure. Sans cette composition, le reschedule
      // vers un jour nommé restait sans scheduled_for → create nu → bloqué
      // duplicate → « bien décalé à jeudi » confabulé.
      // La composition PRIME sur un scheduledFor déjà rempli par la
      // complétion (probe P9-2 passe 3: « le rappel de 22h » remplissait
      // 22h AUJOURD'HUI — l'heure de la cible sans le jour nommé → replace
      // au même instant + « samedi » brodé) — SAUF si le message porte une
      // heure chiffrée étrangère à celle de la cible (là, l'heure explicite
      // du user gagne, « même heure » est une référence lâche).
      if (uniqueRescheduleTarget) {
        try {
          const combinedRescheduleText =
            `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`
              .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
          const sameHourInvariance = /\b(a la )?meme heure\b/.test(
            combinedRescheduleText,
          );
          // Le jour se lit dans la CLAUSE de déplacement (when_hint, puis le
          // segment après le verbe) — jamais le premier mot-jour du message
          // (« finalement DEMAIN c'est mort… décale-le à JEUDI » doit lire
          // jeudi, pas demain).
          const whenHintDaySource = String(
            payloadText(createEffect, "when_hint") ?? "",
          ).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
          const afterVerbDaySource = combinedRescheduleText
            .split(
              /\b(?:mets|remets|remet|decale|repousse|replanifie|reprogramme|avance)\b/,
            ).slice(1).join(" ");
          const dayRegex =
            /\b(apres[- ]demain|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/;
          const namedDayToken = whenHintDaySource.match(dayRegex)?.[1] ??
            afterVerbDaySource.match(dayRegex)?.[1] ?? null;
          if (sameHourInvariance && namedDayToken) {
            const tctxSameHour = await getUserTimeContext({
              supabase: args.supabase,
              userId: args.userId,
              now,
            });
            const inheritedHHMM = localHHMMForScheduledFor(
              String(uniqueRescheduleTarget.scheduled_for ?? ""),
              tctxSameHour.user_timezone || "Europe/Paris",
            );
            // Heures chiffrées du message étrangères à celle de la cible:
            // s'il y en a, l'utilisateur a donné une heure explicite — la
            // composition ne l'écrase pas.
            const foreignExplicitHours = [
              ...combinedRescheduleText.matchAll(
                /\b(\d{1,2})\s?h\s?(\d{2})?\b/g,
              ),
            ].map((m) =>
              `${m[1].padStart(2, "0")}:${(m[2] ?? "00").padEnd(2, "0")}`
            ).filter((hhmm) => hhmm !== inheritedHHMM);
            const compositionEligible = !compiledPayload.scheduledFor ||
              foreignExplicitHours.length === 0;
            if (inheritedHHMM && compositionEligible) {
              // Résolution civile du jour nommé (prochaine occurrence en tz
              // user) — le parseur ne résout pas un jour de semaine nu; on
              // lui compose une DATE ABSOLUE française, sa forme sûre (le
              // fallback naïf ancrait « jeudi à 22h » sur AUJOURD'HUI).
              const timezoneSameHour = tctxSameHour.user_timezone ||
                "Europe/Paris";
              const weekdayFmt = new Intl.DateTimeFormat("fr-FR", {
                timeZone: timezoneSameHour,
                weekday: "long",
              });
              const civilFmt = new Intl.DateTimeFormat("fr-CA", {
                timeZone: timezoneSameHour,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              });
              const monthNames = [
                "janvier", "février", "mars", "avril", "mai", "juin",
                "juillet", "août", "septembre", "octobre", "novembre",
                "décembre",
              ];
              let composedAbsolute: string | null = null;
              const nowMsSameHour = new Date(tctxSameHour.now_utc).getTime();
              for (let dayOffset = 1; dayOffset <= 14; dayOffset += 1) {
                const candidate = new Date(
                  nowMsSameHour + dayOffset * 86_400_000,
                );
                const matchesToken = namedDayToken === "demain"
                  ? dayOffset === 1
                  : namedDayToken.startsWith("apres")
                  ? dayOffset === 2
                  : weekdayFmt.format(candidate).toLowerCase() ===
                    namedDayToken;
                if (!matchesToken) continue;
                const civil = civilFmt.format(candidate);
                const [yearStr, monthStr, dayStr] = civil.split("-");
                composedAbsolute = `rappelle-moi le ${Number(dayStr)} ${
                  monthNames[Number(monthStr) - 1]
                } ${yearStr} à ${
                  inheritedHHMM.replace(":", "h")
                } de t'en occuper`;
                break;
              }
              const parsedSameHour = composedAbsolute
                ? (parseOneShotReminderRequest({
                  message: composedAbsolute,
                  timezone: timezoneSameHour,
                  nowIso: tctxSameHour.now_utc,
                })?.scheduledFor ??
                  parseScheduledForFromMessage({
                    message: composedAbsolute,
                    timezone: timezoneSameHour,
                    nowIso: tctxSameHour.now_utc,
                  }))
                : null;
              if (parsedSameHour) {
                compiledPayload = {
                  ...compiledPayload,
                  scheduledFor: parsedSameHour,
                  localLabel: formatOneShotLocalLabel(
                    parsedSameHour,
                    tctxSameHour.user_timezone,
                  ),
                };
              }
            }
          }
        } catch (_error) {
          // best-effort: blocage honnête historique si la composition échoue.
        }
      }
      // P12-A (alex-untested24 R1-B05): décalage RELATIF « avance/recule/
      // décale d'une heure » — le delta s'applique à l'heure de la CIBLE,
      // jamais à maintenant (le when_hint « dans une heure » émis par le
      // dispatcher re-résolvait now+1h, direction inversée en prime: rappel
      // de 17h « avancé » à 10h46). « avance » = plus tôt ; « recule/
      // repousse/décale de » = plus tard. Cette composition PRIME sur un
      // scheduledFor de complétion (la source du now+1h). Un résultat passé
      // n'est pas committable → scheduledFor annulé (clarify honnête).
      if (uniqueRescheduleTarget) {
        try {
          const combinedDeltaText =
            `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`
              .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
          const deltaMatch = combinedDeltaText.match(
            /\b(avance|recule|repousse|decale)\b[^.!?]{0,60}?\bd(?:e\s+|['’]\s?)(une|deux|trois|\d{1,3})\s+(demi-?\s?heures?|heures?|minutes?)\b/,
          );
          if (deltaMatch) {
            const numberWords: Record<string, number> = {
              une: 1,
              deux: 2,
              trois: 3,
            };
            const amount = numberWords[deltaMatch[2]] ??
              Number(deltaMatch[2]);
            const unit = deltaMatch[3];
            const deltaMinutes = /demi/.test(unit)
              ? 30
              : /minute/.test(unit)
              ? amount
              : amount * 60;
            const direction = deltaMatch[1] === "avance" ? -1 : 1;
            const targetMs = new Date(
              String(uniqueRescheduleTarget.scheduled_for ?? ""),
            ).getTime();
            if (
              Number.isFinite(targetMs) && Number.isFinite(deltaMinutes) &&
              deltaMinutes > 0
            ) {
              const shiftedMs = targetMs + direction * deltaMinutes * 60_000;
              if (shiftedMs > now.getTime() + 30_000) {
                const tctxDelta = await getUserTimeContext({
                  supabase: args.supabase,
                  userId: args.userId,
                  now,
                });
                const shiftedIso = new Date(shiftedMs).toISOString();
                compiledPayload = {
                  ...compiledPayload,
                  scheduledFor: shiftedIso,
                  localLabel: formatOneShotLocalLabel(
                    shiftedIso,
                    tctxDelta.user_timezone || "Europe/Paris",
                  ),
                  parseSource: "local_parser",
                };
              } else {
                compiledPayload = { ...compiledPayload, scheduledFor: null };
              }
            }
          }
        } catch (_error) {
          // best-effort: blocage honnête historique si le calcul échoue.
        }
      }
      if (uniqueRescheduleTarget && compiledPayload.scheduledFor) {
        try {
          const tctxReschedule = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now,
          });
          const targetHHMM = localHHMMForScheduledFor(
            String(uniqueRescheduleTarget.scheduled_for ?? ""),
            tctxReschedule.user_timezone || "Europe/Paris",
          );
          createEffect = {
            ...createEffect!,
            payload_hint: {
              ...((createEffect!.payload_hint ?? {}) as Record<
                string,
                unknown
              >),
              intent: "replace",
              replace_target_label: targetHHMM,
            },
          };
          // P6-V (harness r5g-s2 T3) — INVARIANCE DE CONTENU: un reschedule
          // déplace l'HEURE, jamais le texte (sémantique P6-H actée). Le
          // contenu du nouveau rappel s'hérite TOUJOURS du pending déplacé
          // (P3-F, résolu par replace_target_label) — jamais l'écho de
          // commande ni un libellé recalculé.
          compiledPayload = { ...compiledPayload, instruction: null };
        } catch (_error) {
          // Lecture timezone indisponible: blocage honnête historique.
        }
      }
      if (payloadText(createEffect, "intent") !== "replace") {
        // P12-D6 (alex-untested24 R1-B06): le blocage honnête reste pour une
        // cible NON résoluble — mais sa reply ne dicte plus la formule
        // circulaire « annule-le et remets-le à [heure] » (guidance V1
        // résiduelle qui tournait en rond): elle demande la CIBLE avec
        // l'inventaire nominatif, et un pending replace s'arme pour que la
        // réponse (contenu ou heure) exécute le déplacement via la fusion
        // D1/D5. Condition de désarmement: cible résoluble + heure
        // haute-confiance n'atteignent plus ce blocage (replace atomique
        // P6-H exécuté en amont sur tous les chemins d'admission).
        let inventoryLines: string[] = [];
        try {
          const tctxInventory = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now,
          });
          const timezoneInventory = tctxInventory.user_timezone ||
            "Europe/Paris";
          inventoryLines = (pendingRows ?? []).map((row) => {
            const rowInstruction = String(
              (row?.message_payload as Record<string, unknown> | undefined)
                ?.reminder_instruction ?? "",
            ).trim() || "rappel ponctuel";
            return `« ${rowInstruction} » à ${
              localHHMMForScheduledFor(
                String(row?.scheduled_for ?? ""),
                timezoneInventory,
              ) ?? "?"
            }`;
          });
        } catch (_error) {
          // Lecture best-effort: sans inventaire, la question reste honnête.
        }
        const missingNewTime = !compiledPayload.scheduledFor;
        const blockedReply = inventoryLines.length > 0
          ? `Je ne suis pas sûre du rappel à déplacer. En attente : ${
            inventoryLines.join(" ; ")
          }. Dis-moi lequel (son contenu ou son heure)${
            missingNewTime ? " et la nouvelle heure" : ""
          } — rien n'a été changé pour l'instant.`
          : "Je ne peux pas déplacer ce rappel tel quel — dis-moi quel rappel tu vises et la nouvelle heure. Rien n'a été changé pour l'instant.";
        return {
          ...baseDirectEffectResult({
            detected: true,
            intent: "create",
            status: "blocked",
            reason_code: "reschedule_not_supported",
            reply: blockedReply,
          }),
          requested_effects: [{ type: effectType, reason_code: "reschedule" }],
          blocked_effects: [{
            type: effectType,
            reason_code: "reschedule_not_supported",
          }],
          pending_clarification: {
            intent: "replace",
            reason_code: "replace_target_ambiguous",
            clarify_question: blockedReply,
            known_slots: {
              UTC_time: compiledPayload.scheduledFor ?? null,
              local_label: compiledPayload.localLabel ?? null,
              instruction_hint: null,
              replace_target_label: null,
            },
          },
        };
      }
    }
  }
  st.createEffect = createEffect;
  st.compiledPayload = compiledPayload;
  st.allowDuplicateForTurn = allowDuplicateForTurn;
  return null;
}
