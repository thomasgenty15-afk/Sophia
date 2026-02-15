/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z, getRequestId, jsonResponse, parseJsonBody, serverError } from "../_shared/http.ts";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { generateWithGemini } from "../_shared/gemini.ts";

type TranscriptMsg = { role: "user" | "assistant"; content: string; agent_used?: string | null };

type Difficulty = "easy" | "mid" | "hard";

function findObjective(objs: any[], kind: string): any | null {
  if (!Array.isArray(objs)) return null;
  return objs.find((o) => String(o?.kind ?? "").trim() === kind) ?? null;
}

function validateUpdateActionStageMessage(
  stage: number,
  msg: string,
  meta: { increaseTo: number; decreaseTo: number; daysInitial: string[]; dayToRemove: string },
): { ok: boolean; reason: string } {
  const t = String(msg ?? "").trim().toLowerCase();
  if (!t) return { ok: false, reason: "empty" };

  const hasAnyDay =
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim|mon|tue|wed|thu|fri|sat|sun)\b/i
      .test(t);
  const hasRemoveVerb = /\b(enl[eè]ve|retire|supprime)\b/i.test(t);

  // Stage 2 is the critical one for mechanical assertions:
  // user must say they want fewer reps AND that a day must be removed, without naming any day or proposing which one.
  if (stage === 2) {
    if (hasAnyDay) return { ok: false, reason: "stage2_mentions_day" };
    if (hasRemoveVerb) return { ok: false, reason: "stage2_mentions_remove_verb" };
    // Must explicitly state the target frequency (e.g. "3 fois par semaine"), not just mention "3" somewhere.
    const wantsDecrease = new RegExp(`\\b${meta.decreaseTo}\\s*(?:fois|x)\\s*par\\s*semaine\\b`, "i").test(t);
    if (!wantsDecrease) return { ok: false, reason: "stage2_missing_decrease_to_target_reps" };
    const mentionsNeedRemove =
      /\b(enlever|retirer|supprimer)\b/i.test(t) || /\bil\s+faut\b.*\b(en\s+)?(enlever|retirer|supprimer)\b/i.test(t);
    if (!mentionsNeedRemove) return { ok: false, reason: "stage2_missing_need_remove_day" };
  }

  // Stage 3: must pick the day to remove (include token like "sat" or "samedi")
  if (stage === 3) {
    const token = String(meta.dayToRemove ?? "").toLowerCase();
    const okToken = token ? t.includes(token) : false;
    const okFr = token === "sat" ? /\bsamedi\b/i.test(t) : true;
    if (!okToken && !okFr) return { ok: false, reason: "stage3_missing_day_to_remove" };
    if (!hasRemoveVerb) return { ok: false, reason: "stage3_missing_remove_verb" };
  }

  // Stages 0/1: allow days; nothing strict beyond non-empty.
  return { ok: true, reason: "ok" };
}

// NOTE: we intentionally removed the global "looksAssistantish" gate.
// This narrower check is only to avoid tool-eval instability where the simulated *user*
// parrots assistant-style confirmations (which then creates artificial "redundant confirmation" issues).
function looksLikeUserParrotsAssistantRecap(msg: string): boolean {
  const t = String(msg ?? "").trim().toLowerCase();
  if (!t) return false;
  const hasNoted = /\bc['’]?est\s+not[ée]\b/.test(t) || /\bbien\s+not[ée]\b/.test(t);
  const hasDashboard = /\b(dashboard|tableau\s+de\s+bord)\b/.test(t);
  const hasHabitRecap = /\b(l['’]?habitude|est\s+bien\s+(ajust[ée]e|configur[ée]e))\b/.test(t);
  const daysCount =
    (t.match(/\b(lun(di)?|mar(di)?|mer(credi)?|jeu(di)?|ven(dredi)?|sam(edi)?|dim(anche)?|mon|tue|wed|thu|fri|sat|sun)\b/g) ?? [])
      .length;
  return (hasNoted || hasDashboard || hasHabitRecap) && daysCount >= 2;
}

function validateBreakDownActionStageMessage(
  stage: number,
  msg: string,
  meta: { title: string },
): { ok: boolean; reason: string } {
  const t = String(msg ?? "").trim().toLowerCase();
  if (!t) return { ok: false, reason: "empty" };
  if (/\b(à\s+bout|panique|crise)\b/i.test(t)) return { ok: false, reason: "triggers_firefighter" };
  if (/\b(dashboard|tableau\s+de\s+bord)\b/i.test(t)) return { ok: false, reason: "mentions_dashboard" };
  if (/\b(description|texte|renomm|changer\s+le\s+texte|modifier\s+le\s+texte)\b/i.test(t)) {
    return { ok: false, reason: "mentions_text_edit" };
  }
  const mentionsBreakdown = /\b(micro-étape|micro[-\s]?etape|d[ée]coupe|d[ée]couper)\b/i.test(t);
  const mentionsMissed = /\b(pas\s+fait|non\b|rat[ée]|j['’]ai\s+pas\s+fait)\b/i.test(t);
  const affirmative = /\b(oui|ok|d['’]accord|vas[-\s]?y)\b/i.test(t);
  // Stage rules:
  if (stage === 0) {
    if (!/\b(check|bilan)\b/i.test(t)) return { ok: false, reason: "stage0_missing_checkup_trigger" };
    return { ok: true, reason: "ok" };
  }
  if (stage === 1) {
    if (!mentionsMissed) return { ok: false, reason: "stage1_missing_missed" };
    if (mentionsBreakdown) return { ok: false, reason: "stage1_mentions_breakdown_too_early" };
    return { ok: true, reason: "ok" };
  }
  if (stage === 2) {
    // Keep it simple: add context, no "continue", no premature breakdown request.
    if (/\b(on\s+continue|et\s+on\s+continue|passons)\b/i.test(t)) return { ok: false, reason: "stage2_mentions_continue" };
    return { ok: true, reason: "ok" };
  }
  if (stage === 3) {
    if (!affirmative) return { ok: false, reason: "stage3_missing_affirmative" };
    // Prefer mentioning breakdown explicitly, but allow short "oui/vas-y" answers (assistant might have just asked it).
    return { ok: true, reason: "ok" };
  }
  if (stage === 4) {
    if (t.length < 10) return { ok: false, reason: "stage4_too_short" };
    return { ok: true, reason: "ok" };
  }
  if (stage === 5) {
    if (!affirmative) return { ok: false, reason: "stage5_missing_affirmative" };
    if (!/\b(ajoute|mets|ok\s+pour|vas[-\s]?y)\b/i.test(t)) return { ok: false, reason: "stage5_missing_add_to_plan_intent" };
    if (!/\bplan\b/i.test(t)) return { ok: false, reason: "stage5_missing_plan_word" };
    return { ok: true, reason: "ok" };
  }
  return { ok: true, reason: "ok" };
}

function validateActivateActionStageMessage(
  stage: number,
  msg: string,
  meta: { title: string },
): { ok: boolean; reason: string } {
  const t = String(msg ?? "").trim().toLowerCase();
  if (!t) return { ok: false, reason: "empty" };
  if (/\b(dashboard|tableau\s+de\s+bord)\b/i.test(t)) return { ok: false, reason: "mentions_dashboard" };
  if (stage === 0) {
    if (!t.includes(String(meta.title).toLowerCase())) return { ok: false, reason: "stage0_missing_title" };
    // Realistic context: user wonders "what's next" / "what is this step", not necessarily "pending".
    if (!/\b(c['’]est\s+quoi|ça\s+sert\s+à\s+quoi|c['’]est\s+quoi\s+exactement|c['’]est\s+la\s+suite|vient\s+apr[eè]s|prochaine\s+[ée]tape|je\s+veux\s+avancer)\b/i.test(t)) {
      return { ok: false, reason: "stage0_missing_next_step_question" };
    }
    return { ok: true, reason: "ok" };
  }
  if (stage === 1) {
    if (!t.includes(String(meta.title).toLowerCase())) return { ok: false, reason: "stage1_missing_title" };
    // Stage 1 is "hesitation / clarification", not a refusal or a scheduling choice.
    if (/\b(au\s+feeling|je\s+pr[ée]f[ée]re\s+la\s+garder|je\s+pr[ée]f[ée]re\s+la\s+laisser|on\s+laisse)\b/i.test(t)) {
      return { ok: false, reason: "stage1_refusal_or_feeling_too_early" };
    }
    if (!/\b(je\s+sais\s+pas|j['’]h[eé]site|si\s+je\s+l['’]active|ça\s+change\s+quoi|ça\s+implique|j['’]ai\s+peur)\b/i.test(t)) {
      return { ok: false, reason: "stage1_missing_doubt" };
    }
    return { ok: true, reason: "ok" };
  }
  // stage 2: explicit activation request
  if (/\b(au\s+feeling|plus\s+tard|on\s+verra|on\s+laisse|pas\s+maintenant)\b/i.test(t)) {
    return { ok: false, reason: "stage2_refusal_or_defer" };
  }
  if (!/\b(active|activer|active[-\s]?la)\b/i.test(t)) return { ok: false, reason: "stage2_missing_activate_intent" };
  if (!t.includes(String(meta.title).toLowerCase())) return { ok: false, reason: "stage2_missing_title" };
  return { ok: true, reason: "ok" };
}

function inferActivateActionStageFromTranscript(ts: TranscriptMsg[], title: string): number {
  const text = (ts ?? []).map((m) => `${m.role}:${m.content}`).join("\n").toLowerCase();
  const t = String(title ?? "").toLowerCase();
  if (/\b(activ[ée]e?|j['’]ai\s+activ[ée]e?)\b/i.test(text) && text.includes(t)) return 2;
  if (/\b(tu\s+veux|ok\s+pour|ça\s+te\s+va)\b[\s\S]{0,80}\b(activ|activer)\b/i.test(text) && text.includes(t)) return 1;
  return 0;
}

function inferCreateActionStageFromTranscript(ts: TranscriptMsg[]): number {
  const text = (ts ?? []).map((m) => `${m.role}:${m.content}`).join("\n").toLowerCase();
  // Stages:
  // 0) intro/explore
  // 1) time/duration
  // 2) frequency + hesitation
  // 3) explicit consent to add
  // 4) rename/confirm details
  // 5) insist active/not pending
  // IMPORTANT: don't jump to stage 5 just because "dashboard" appears anywhere (assistant might mention it early).
  // Stage 5 should be about "not pending / must be active".
  if (/\b(pas\s+juste\s+pending|pas\s+pending|visible\/?active|pas\s+en\s+attente)\b/i.test(text)) return 5;
  if (/\b(appelle(-|\s)?la|renomme|nomme(-|\s)?la|\"lecture\"|«\s*lecture\s*»|“\s*lecture\s*”)\b/i.test(text)) return 4;
  if (/\b(ok|vas-y|oui)\b/i.test(text) && /\b(ajoute|l'ajoute|tu peux l'ajouter|mets(-|\s)?la)\b/i.test(text)) return 3;
  if (/\b(\d+)\s*(fois|x)\s*par\s*semaine\b/i.test(text) || /\bfr[ée]quence\b/i.test(text)) return 2;
  if (/\b(10\s*minutes|minutes|avant\s+de\s+dormir|le\s+soir)\b/i.test(text)) return 1;
  return 0;
}

function inferUpdateActionStageFromTranscript(ts: TranscriptMsg[]): number {
  const text = (ts ?? []).map((m) => `${m.role}:${m.content}`).join("\n").toLowerCase();
  // Stages:
  // 0) ask for update (increase reps + set days)
  // 1) confirm/choose days if assistant asks
  // 2) decrease reps while days already set -> should trigger "which day to remove"
  // 3) answer which day to remove
  if (/\b(enl[eè]ve|retire|supprime)\b/i.test(text) && /\b(samedi|sat)\b/i.test(text)) return 3;
  if (/\b(\d+)\s*(fois|x)\s*par\s*semaine\b/i.test(text) && /\b(baiss|descend|ramen[eè]ne|passe\s+[àa]\s*3)\b/i.test(text)) return 2;
  if (/\b(lundi|mercredi|vendredi|samedi|lun|mer|ven|sat)\b/i.test(text) && /\b(jours|cal|fix)\b/i.test(text)) return 1;
  return 0;
}

function looksLikePanicCrisisUser(ts: TranscriptMsg[]): boolean {
  // IMPORTANT: only treat panic/crisis as "active" if it appears in the most recent user message(s).
  // Otherwise, a single early panic mention would make the whole scenario stick to the crisis branch forever.
  const recentUser = [...(ts ?? [])]
    .reverse()
    .filter((m) => m?.role === "user")
    .slice(0, 2);
  return recentUser.some((m) =>
    /\b(crise\s+de\s+panique|je\s+panique|panique|angoisse)\b/i.test(String(m?.content ?? "")),
  );
}

function hasAssistantMode(ts: TranscriptMsg[], mode: string): boolean {
  const target = String(mode ?? "").trim().toLowerCase();
  if (!target) return false;
  return (ts ?? []).some((m) =>
    m?.role === "assistant" &&
    String((m as any)?.agent_used ?? "").trim().toLowerCase().includes(target)
  );
}

function buildTopicExplorationHandoffStateMachineContext(
  obj: any,
  ts: TranscriptMsg[],
  turnIndex: number,
  maxTurns: number,
): { stage: number; finalStage: number; ctx: string; forcedDone: boolean } {
  const spec = (obj?.spec && typeof obj.spec === "object") ? obj.spec : {};
  const finalStage = 8;

  const userMsgs = (ts ?? []).filter((m) => m?.role === "user").map((m) => String(m?.content ?? ""));
  const assistantMsgs = (ts ?? []).filter((m) => m?.role === "assistant").map((m) => String(m?.content ?? ""));
  const uAll = userMsgs.join("\n").toLowerCase();
  const aLast = String(assistantMsgs.slice(-1)[0] ?? "");
  const aLastL = aLast.toLowerCase();

  const hasStop = /\b(stop|laisse\s+tomber|on\s+change\s+de\s+sujet|change\s+de\s+sujet|j['’]en\s+ai\s+marre|on\s+arr[êe]te)\b/i.test(uAll);
  const hasBored = /\b(je\s+d[ée]croche|tu\s+me\s+perds|bref)\b/i.test(uAll);
  const hasDistress = /\b(boule\s+au\s+ventre|panique|angoisse|j['’]ai\s+du\s+mal\s+a\s+respirer|je\s+suffoque|stress[ée]?)\b/i.test(uAll);
  const hasReturnPlan = /\b(revenir\s+au\s+plan|reprendre\s+le\s+plan|on\s+revient\s+au\s+plan|reparler\s+du\s+plan)\b/i.test(uAll);
  const askedNoTool = /\b(sans\s+tool|sans\s+outil|sans\s+outils|sans\s+outil\s+pour\s+l['’]instant)\b/i.test(uAll);
  const hasFinalThanks = /\b(merci[, ]+\s*c['’]est\s+bon|merci\s+c['’]est\s+bon|on\s+s['’]arr[êe]te|c['’]est\s+bon\s+pour\s+moi)\b/i.test(uAll);

  const askedMicroAction = /\b(micro[-\s]?action|un\s+truc\s+simple|une\s+action\s+simple|2\s+minutes|deux\s+minutes)\b/i.test(uAll);
  const assistantActivated = /\b(j['’]ai\s+activ[ée]|\bactiv[ée]\b|c['’]est\s+activ[ée]|je\s+l['’]ai\s+mis\s+en\s+place)\b/i.test(aLastL);

  // Stage progression (coarse):
  // 0) Ask to move on plan
  // 1) Push for one micro-action (optionally activate)
  // 2) Mild friction ("tu me perds") before hard stop
  // 3) Explicit stop/change topic (handoff)
  // 4) Small talk / new topic
  // 5) Acute stress (trigger firefighter)
  // 6) Return to plan gently
  // 7) Ask next step without tools
  // 8) Close conversation
  let stage = 0;
  if (askedMicroAction || assistantActivated) stage = Math.max(stage, 1);
  if (hasBored) stage = Math.max(stage, 2);
  if (hasStop) stage = Math.max(stage, 3);
  // If we stopped, the next "topic" is usually a new subject or small talk.
  if (stage >= 3 && userMsgs.length >= 4) stage = Math.max(stage, 4);
  if (hasDistress) stage = Math.max(stage, 5);
  if (hasReturnPlan) stage = Math.max(stage, 6);
  if (askedNoTool) stage = Math.max(stage, 7);
  if (hasFinalThanks) stage = Math.max(stage, 8);

  // Prevent early "done": this scenario is meant to run the full budget (realistic pacing).
  const forcedDone = stage >= finalStage && (turnIndex + 1 >= maxTurns);

  const desired = (() => {
    if (turnIndex === 0) return "Démarre la conversation en demandant quoi faire sur ton plan (simple, humain).";
    if (stage === 0) return "Reformule ton besoin: avancer sur le plan, tu veux un point de départ concret.";
    if (stage === 1 && !assistantActivated) return "Demande 1 micro-action concrète (2 minutes) et propose de l'activer, sans être robotique.";
    if (stage === 1 && assistantActivated) return "OK, mais demande un repère simple/clarif (sans retomber dans un plan long).";
    if (stage === 2) return "Exprime que tu décroches / que c'est trop. 1 message, naturel (pas agressif).";
    if (stage === 3) return "Dis explicitement stop / on change de sujet. Court.";
    if (stage === 4 && !hasDistress) return "Passe à un sujet différent de façon humaine (petite question ou remarque).";
    if (stage === 5) return "Exprime un stress corporel concret (boule au ventre), demande 2 minutes pour redescendre.";
    if (stage === 6) return "Remercie et propose de revenir au plan doucement (sans pression).";
    if (stage === 7) return "Demande la prochaine étape simple, explicitement sans tool pour l'instant.";
    return "Clôture simplement (merci c'est bon / on s'arrête là).";
  })();

  const softGuards = [
    "Si Sophia te pose une question (A/B ou clarification), réponds de manière simple au lieu de répéter la demande initiale.",
    "Tu peux prendre 2 tours pour changer d'étape si ça fait plus naturel (ex: 'attends' puis 'stop').",
    "Évite les phrases trop 'scriptées' (pas de listes, pas de jargon).",
  ].join("\n- ");

  const requiredSignals = [
    "- Déclencher un moment stop/boredom qui mène à un handoff (architect -> companion).",
    "- Avoir au moins un passage stress/physique pour déclencher firefighter.",
    "- Revenir ensuite au plan de façon douce, puis finir.",
    ...(String(spec?.notes ?? "").trim() ? [`- Notes scénario: ${String(spec.notes).trim()}`] : []),
  ].join("\n");

  const ctx = `
[TOPIC_EXPLORATION_HANDOFF — CONTEXTE]
But: conversation fluide (pas robotique) pour tester les machines globales "topic_serious"/"topic_light" + imbriquation (architect/companion/firefighter) sur ~${maxTurns} tours.

État courant (estimation):
- stage=${stage}/${finalStage}
- tours déjà passés: user=${userMsgs.length}, assistant=${assistantMsgs.length}

Signaux requis (sur l'ensemble du run):
${requiredSignals}

Ce que tu dois faire au prochain message:
- ${desired}

Garde-fous:
- ${softGuards}
`.trim();

  return { stage, finalStage, ctx, forcedDone };
}

// Ultimate full flow state machine - sophisticated phase detection based on transcript
function buildUltimateFullFlowStateMachineContext(
  obj: any,
  ts: TranscriptMsg[],
  turnIndex: number,
  chatState: any,
): { phase: string; ctx: string; forcedDone: boolean } {
  const spec = (obj?.spec && typeof obj.spec === "object") ? obj.spec : {};
  const actions = Array.isArray(spec?.actions) ? spec.actions : [];
  const digressionTopic = String(spec?.digression_topic ?? "mon travail qui me stresse");
  const emojiPref = String(spec?.emoji_preference ?? "plus d'emojis");

  const allText = (ts ?? []).map((m) => `${m.role}:${m.content}`).join("\n").toLowerCase();
  const userMsgs = (ts ?? []).filter((m) => m?.role === "user").map((m) => String(m?.content ?? "").toLowerCase());
  const assistantMsgs = (ts ?? []).filter((m) => m?.role === "assistant");
  const hasTranscript = Array.isArray(ts) && ts.length > 0;
  const lastAssistant = assistantMsgs.slice(-1)[0];
  const lastAssistantText = String(lastAssistant?.content ?? "").toLowerCase();
  const lastAssistantAgent = String(lastAssistant?.agent_used ?? "").toLowerCase();
  const userAll = userMsgs.join("\n");

  // State detection from chat_state
  const investigationActive = Boolean(chatState?.investigation_state);
  const investigationStatus = String(chatState?.investigation_state?.status ?? "");
  const isPostCheckup = investigationStatus === "post_checkup";
  const deferredTopics = chatState?.temp_memory?.global_deferred_topics ?? [];
  const hasDeferredTopics = Array.isArray(deferredTopics) && deferredTopics.length > 0;

  // Phase detection based on transcript content and state
  const bilanInvited = /\b(bilan|check|faire\s+le\s+point|on\s+fait\s+le\s+point)\b/i.test(allText);
  const bilanAccepted = bilanInvited && /\b(oui|ok|c['']est\s+parti|on\s+y\s+va|allons-y)\b/i.test(userAll);
  const panicTriggered = /\b(cœur|coeur)\s+(qui\s+)?bat|panique|j['']arrive\s+(pas|plus)\s+[àa]\s+respirer|angoisse/i.test(userAll);
  const panicResolved = panicTriggered && /\b(ça\s+va\s+mieux|je\s+me\s+sens\s+mieux|c['']est\s+bon|ça\s+passe)\b/i.test(userAll);
  const digressionMentioned = new RegExp(digressionTopic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(' ').slice(0, 3).join('.*'), 'i').test(userAll);
  const emojiHintGiven = /\b(emoji|emojis|émoticône|emoticone)\b/i.test(userAll);
  // bilanEnded: must be truly post-checkup (investigation cleared) OR explicitly investigation_complete in state
  const bilanEnded = isPostCheckup || (!investigationActive && bilanAccepted && assistantMsgs.length > 8);
  // deferredSurfaced: Sophia brings up a topic that was mentioned during the bilan as a digression
  const deferredSurfaced = bilanEnded && (
    /\b(tu\s+m['']avais\s+parlé|on\s+avait\s+parlé|tu\s+voulais\s+parler|tu\s+mentionnais|on\s+en\s+avait\s+parlé|tout\s+à\s+l['']heure)\b/i.test(lastAssistantText) ||
    (digressionMentioned && /\b(boss|travail|boulot|stress|chef)\b/i.test(lastAssistantText))
  );
  const emojiConfirmAsked = /\b(emoji|emojis)\b/i.test(lastAssistantText) && /\b(confirm|tu\s+veux|préfère|préférence)\b/i.test(lastAssistantText);
  const emojiConfirmed = emojiHintGiven && emojiConfirmAsked && /\b(oui|confirm|je\s+veux|j['']aimerais)\b/i.test(userMsgs.slice(-1)[0] ?? "");

  // Count which actions have been discussed
  const actionsDiscussed = actions.filter((a: any) => {
    const title = String(a?.title ?? "").toLowerCase();
    return allText.includes(title.slice(0, 10));
  }).length;

  // Determine current phase
  let phase = "BILAN_INVITE";
  let instruction = "Dis bonjour simplement. Sophia devrait te proposer le bilan.";
  let forcedDone = false;

  // CRITICAL GUARD: Only allow greeting at turn 0 with empty transcript
  const allowGreeting = turnIndex === 0 && !hasTranscript && userMsgs.length === 0 && assistantMsgs.length === 0;

  if (allowGreeting) {
    phase = "BILAN_INVITE";
    instruction = "Dis bonjour de manière neutre ('Salut Sophia', 'Hey', 'Coucou'). N'evoque PAS le bilan - c'est Sophia qui doit le proposer.";
  } else if (!bilanAccepted && bilanInvited) {
    phase = "BILAN_ACCEPT";
    instruction = "Sophia t'a proposé le bilan. Accepte simplement ('Oui', 'Ok on y va', 'C'est parti').";
  } else if (bilanAccepted && !panicTriggered && actionsDiscussed === 1) {
    phase = "ACTION_1_REPORT";
    instruction = "Sophia te demande comment ça s'est passé pour la première action (eau). Dis que tu as réussi.";
  } else if (bilanAccepted && !panicTriggered && actionsDiscussed >= 2 && lastAssistantAgent === "investigator") {
    phase = "PANIC_TRIGGER";
    instruction = "C'est le moment de déclencher une crise de panique. Dis quelque chose comme: 'Attends... là j'ai le cœur qui s'emballe, j'arrive plus à respirer...' Sois physique et concret.";
  } else if (panicTriggered && !panicResolved && lastAssistantAgent === "firefighter") {
    phase = "PANIC_GROUNDING";
    instruction = "Firefighter t'aide à te calmer. Suis ses instructions (respirer, etc.). Après 2-3 échanges, dis 'ça va mieux'.";
  } else if (panicResolved && !digressionMentioned && investigationActive && actionsDiscussed < 4) {
    // Check if we're on the meditation action (5 failures - breakdown expected)
    const onMeditationAction = /\b(méditer|meditation|méditation|mediter)\b/i.test(lastAssistantText);
    if (onMeditationAction) {
      phase = "ACTION_FAIL_WITH_BREAKDOWN";
      instruction = "Sophia parle de la méditation. Dis que tu n'as pas réussi cette semaine non plus. Attends que Sophia propose spontanément un breakdown (elle devrait remarquer les 5 échecs). Accepte si elle propose.";
    } else {
      phase = "BILAN_CONTINUE";
      instruction = "Le bilan continue. Réponds aux questions de Sophia sur les actions. Pour la marche: tu n'as pas fait. Pour la lecture: tu as fait.";
    }
  } else if (investigationActive && !digressionMentioned && actionsDiscussed >= 3) {
    phase = "DIGRESSION";
    instruction = `DIGRESSION: Pars sur un autre sujet de manière naturelle: "${digressionTopic}". Par exemple: "Au fait, en parlant de ça, ${digressionTopic}, tu sais..."`;
  } else if (investigationActive && digressionMentioned && !emojiHintGiven) {
    phase = "EMOJI_HINT";
    instruction = `Pendant la discussion de la dernière action, glisse: "Au fait, je me demandais si tu pourrais utiliser ${emojiPref}, mais je suis pas sûr." Ne confirme pas - juste une mention floue.`;
  } else if (isPostCheckup && !deferredSurfaced) {
    phase = "WAITING_DEFERRED";
    instruction = "Le bilan est fini. Attends que Sophia ramène le sujet de ta digression. Réponds 'ok' ou 'merci' pour laisser Sophia prendre l'initiative.";
  } else if (deferredSurfaced && !emojiConfirmed) {
    phase = "DEFERRED_DISCUSS";
    instruction = "Sophia a ramené le sujet de ta digression. Discute brièvement, puis dis 'c'est bon pour ce point' pour clore.";
  } else if (bilanEnded && emojiHintGiven && emojiConfirmAsked && !emojiConfirmed) {
    phase = "EMOJI_CONFIRM";
    instruction = "Sophia te demande de confirmer ta préférence emoji. Confirme clairement: 'Oui, j'aimerais plus d'emojis' ou 'Oui, utilise plus d'emojis'.";
    forcedDone = false; // Not done until confirmed
  } else if (emojiConfirmed) {
    // ONLY mark done when emoji is EXPLICITLY confirmed (not just hinted)
    phase = "DONE";
    instruction = "Scénario terminé. Dis au revoir.";
    forcedDone = true;
  } else if (!allowGreeting && phase === "BILAN_INVITE") {
    // FALLBACK: If we fell through to default but it's not turn 0, 
    // continue the conversation naturally based on context
    phase = "CONTINUE_NATURALLY";
    if (panicTriggered && !panicResolved) {
      instruction = "Continue à suivre les instructions de Sophia pour te calmer.";
    } else if (investigationActive) {
      instruction = "Le bilan continue. Réponds à la dernière question de Sophia de manière naturelle. Si elle parle d'une action, dis si tu l'as faite ou non.";
    } else if (bilanEnded) {
      instruction = "Le bilan est terminé. Réponds naturellement à Sophia. Si elle ramène un sujet précédent, engage-toi dessus.";
    } else {
      instruction = "Continue la conversation de manière naturelle. NE DIS PAS BONJOUR (la conversation est déjà en cours).";
    }
  }

  const ctx = `
[ULTIMATE FULL FLOW — SOPHISTICATED STATE MACHINE]
Ce scénario teste: Bilan (4 actions) + Panic + Breakdown proposal + Digression (deferred) + Emoji preference (confirm).
Le test se termine UNIQUEMENT quand la préférence emoji est confirmée.

PHASE ACTUELLE: ${phase}
Turn: ${turnIndex + 1}

DÉTECTION D'ÉTAT:
- bilan_invited: ${bilanInvited}
- bilan_accepted: ${bilanAccepted}
- panic_triggered: ${panicTriggered}
- panic_resolved: ${panicResolved}
- digression_mentioned: ${digressionMentioned}
- emoji_hint_given: ${emojiHintGiven}
- bilan_ended: ${bilanEnded}
- deferred_surfaced: ${deferredSurfaced}
- emoji_confirmed: ${emojiConfirmed}
- actions_discussed: ${actionsDiscussed}/4
- investigation_active: ${investigationActive}
- is_post_checkup: ${isPostCheckup}
- last_agent: ${lastAssistantAgent}

INSTRUCTION POUR CE TOUR:
${instruction}

RÈGLES CRITIQUES:
1. N'AIDE PAS Sophia - elle doit prendre les initiatives (proposer bilan, proposer breakdown, ramener deferred, etc.)
2. Sois naturel, oral, pas robotique
3. Pour la panique: sois physique ("cœur qui bat", "j'arrive plus à respirer")
4. Pour la digression: pars vraiment sur un autre sujet sans rapport
5. Pour l'emoji: mentionne-le de façon incertaine, ne confirme pas tout de suite
6. Attends que Sophia ramène les sujets (deferred, emoji) - ne les ramène pas toi-même

ACTIONS DU BILAN:
${actions.map((a: any, i: number) => `${i + 1}. ${a.title}: ${a.outcome}${a.panic_trigger ? " [PANIC ICI]" : ""}${a.expect_breakdown_proposal ? " [BREAKDOWN ATTENDU]" : ""}${a.emoji_hint ? " [EMOJI HINT ICI]" : ""}`).join("\n")}

Sujet de digression: "${digressionTopic}"
Préférence emoji: "${emojiPref}"
`.trim();

  return { phase, ctx, forcedDone };
}

// Generic stress test handler for multi-machine scenarios
function buildStressTestStateMachineContext(
  obj: any,
  ts: TranscriptMsg[],
  turnIndex: number,
  maxTurns: number,
): { stage: number; finalStage: number; ctx: string; forcedDone: boolean } {
  const spec = (obj?.spec && typeof obj.spec === "object") ? obj.spec : {};
  
  // Extract phases from spec (phase_1_xxx, phase_2_xxx, etc.)
  const phases: Array<{ key: string; instruction: string }> = [];
  for (const [k, v] of Object.entries(spec)) {
    const match = k.match(/^phase_(\d+)_/);
    if (match && typeof v === "string") {
      phases.push({ key: k, instruction: String(v) });
    }
  }
  phases.sort((a, b) => {
    const na = parseInt(a.key.match(/^phase_(\d+)_/)?.[1] ?? "0", 10);
    const nb = parseInt(b.key.match(/^phase_(\d+)_/)?.[1] ?? "0", 10);
    return na - nb;
  });

  const finalStage = Math.max(phases.length - 1, 0);
  const userMsgs = (ts ?? []).filter((m) => m?.role === "user").map((m) => String(m?.content ?? ""));
  
  // Stage progression: roughly 2 turns per phase (can be adjusted)
  const turnsPerPhase = Math.max(1, Math.floor(maxTurns / Math.max(phases.length, 1)));
  const stage = Math.min(finalStage, Math.floor(turnIndex / turnsPerPhase));
  
  const forcedDone = stage >= finalStage && (turnIndex + 1 >= maxTurns);

  const currentPhase = phases[stage] ?? phases[0];
  const nextPhase = phases[Math.min(stage + 1, phases.length - 1)];
  
  const phasesList = phases.map((p, i) => {
    const marker = i === stage ? " <-- CURRENT" : (i < stage ? " [done]" : "");
    return `${i}) ${p.key}: "${p.instruction}"${marker}`;
  }).join("\n");

  const ctx = `
[STRESS TEST — MULTI-MACHINE SCENARIO]
Goal: realistic conversation testing multiple state machines interacting.

PHASES:
${phasesList}

Current: stage ${stage}/${finalStage}, turn ${turnIndex + 1}/${maxTurns}
User messages so far: ${userMsgs.length}

CURRENT INSTRUCTION:
${currentPhase?.instruction ?? "Continue naturally"}

NEXT INSTRUCTION (preview):
${nextPhase?.instruction ?? "Finish the conversation"}

RULES:
- Be natural, oral, not robotic
- Can take 2 turns to transition between phases if it feels more natural
- If Sophia asks a question, answer it before moving to the next phase
- Express emotions/stress physically when relevant (not just "je suis stresse" but "j'ai une boule au ventre")
- Keep messages short (1-3 sentences max)
`.trim();

  return { stage, finalStage, ctx, forcedDone };
}

function buildComplexMultiMachineStateMachineContext(
  obj: any,
  ts: TranscriptMsg[],
  turnIndex: number,
): { stage: number; finalStage: number; ctx: string; forcedDone: boolean } {
  const spec = (obj?.spec && typeof obj.spec === "object") ? obj.spec : {};
  const createTitle = String(spec?.create_title ?? "Routine anti-panique").trim() || "Routine anti-panique";
  const createContext = String(spec?.create_context ?? "Je veux un truc simple pour arrêter de scroller le soir, mais je suis instable ces jours-ci.").trim();
  const createDuration = Number(spec?.create_duration_minutes ?? 10) || 10;
  const createReps = Number(spec?.create_target_reps ?? 3) || 3;
  const createTimeOfDay = String(spec?.create_time_of_day ?? "evening").trim() || "evening";
  const existingActionTitle = String(spec?.existing_action_title ?? "Sport").trim() || "Sport";
  const deferredTopic = String(spec?.deferred_topic ?? "mon stress au travail").trim() || "mon stress au travail";

  // Stages (user turns):
  // 0) explore creating an action (no consent)
  // 1) give duration + time of day (no consent)
  // 2) give frequency + hesitation about creating now (no consent)
  // 3) panic crisis -> should route firefighter
  // 4) after firefighter: cancel create + request micro-step breakdown for an EXISTING action (NO bilan yet)
  // 5) confirm the existing action was missed + short reason (to feed breakdown)
  // 6) give blocker context + mention the deferred topic (work stress) WITHOUT deferring phrase
  // 7) accept micro-step breakdown
  // 8) provide blocker details if asked
  // 9) accept adding the micro-step to the plan
  // 10) explicitly ask to start a bilan/checkup now (investigator)
  // 11) during bilan: mention the deferred topic naturally (assistant will defer via eval override)
  // 12) post-checkup: engage on deferred topic
  // 13) close the deferred topic (answer "Oui, c'est bon.")

  const inferred = (() => {
    const lastA = [...(ts ?? [])].reverse().find((m) => m?.role === "assistant")?.content ?? "";
    const lastAL = String(lastA).toLowerCase();

    const userSaidCancel = (ts ?? []).some((m) => m?.role === "user" && /\bannule|laisse\s+tomber|stop\b/i.test(String(m?.content ?? "")));
    const userSaidBilan = (ts ?? []).some((m) => m?.role === "user" && /\b(bilan|checkup)\b/i.test(String(m?.content ?? "")));
    const userSaidMissed = (ts ?? []).some((m) => m?.role === "user" && /\b(pas\s+fait|rat[ée]|j['’]ai\s+pas\s+fait)\b/i.test(String(m?.content ?? "")));

    const askedCloseTopic = /c['’]est\s+bon\s+pour\s+ce\s+point\s*\?/i.test(lastA);
    const inPostCheckupConversation =
      /\b(sujet\s+report[ée]|tu\s+m['’]avais\s+dit|mode\s+post)\b/i.test(lastAL) ||
      (/\bstress\b/i.test(lastAL) && /\btravail\b/i.test(lastAL));
    // IMPORTANT: only treat "add to plan" as the micro-step confirmation (stage 9),
    // not the initial "add a new action" prompt (which happens early in the scenario).
    const askedAddToPlan =
      /\b(ajout|ajouter|ajoute|mets)\b/i.test(lastAL) &&
      /\bplan\b/i.test(lastAL) &&
      /\b(tu\s+veux|ok\s+pour|ça\s+te\s+va)\b/i.test(lastAL) &&
      /\bmicro-étape|micro[-\s]?etape\b/i.test(lastAL);
    const offeredBreakdown =
      /\bmicro-étape|micro[-\s]?etape\b/i.test(lastAL) &&
      /\b(d[ée]coupe|d[ée]composer|d[ée]tailler)\b/i.test(lastAL) &&
      /\b(tu\s+veux|ok\s+pour|ça\s+te\s+dit)\b/i.test(lastAL);
    const askedBlocker = /\b(qu['’]?est-ce|quel|quelle)\b/i.test(lastAL) && /\b(bloqu|coinc)\b/i.test(lastAL);

    if (askedCloseTopic) return 13;
    if (inPostCheckupConversation) return 12;
    if (askedAddToPlan) return 9;
    if (askedBlocker) return 8;
    if (offeredBreakdown) return 7;

    // If the bilan/checkup has started, progress that thread.
    if (hasAssistantMode(ts, "investigator")) return 11;

    // If the latest user message is a panic crisis and firefighter hasn't happened yet, stay on the panic stage.
    if (looksLikePanicCrisisUser(ts) && !hasAssistantMode(ts, "firefighter")) return 3;

    // After firefighter, we pivot once: cancel create + request help on the existing action.
    // But do NOT keep re-triggering this stage forever.
    if (hasAssistantMode(ts, "firefighter") && !userSaidCancel) return 4;
    if (userSaidCancel && userSaidMissed) {
      if (userSaidBilan) return 11;
      return 10;
    }
    return 0;
  })();

  const finalStage = 13;
  // Keep the first 3 turns stable to ensure we test Architect pre-panic, then force panic.
  const byTurn =
    (Number(turnIndex) || 0) <= 0 ? 0 :
    (Number(turnIndex) || 0) === 1 ? 1 :
    (Number(turnIndex) || 0) === 2 ? 2 :
    (Number(turnIndex) || 0) === 3 ? 3 :
    inferred;
  const stage = Math.min(finalStage, Math.max(inferred, byTurn));
  const forcedDone = stage >= finalStage;

  const stageInstruction = (() => {
    switch (stage) {
      case 0:
        return [
          `Tu veux créer une action mais tu n'es pas sûr(e). Contexte: ${createContext}`,
          `OBLIGATOIRE: inclure la question "tu en penses quoi ?"`,
          `IMPORTANT: NE DONNE PAS de consentement (pas de "oui" à une question d'ajout, pas de "ok vas-y", pas de "tu peux l'ajouter").`,
        ].join(" ");
      case 1:
        return [
          `Tu donnes des paramètres pratiques.`,
          `OBLIGATOIRE: inclure "${createDuration} minutes" et "le soir" (ou "avant de dormir").`,
          `IMPORTANT: si Sophia te demande de l'ajouter, tu réponds en mode "pas maintenant / je réfléchis" (pas de "oui").`,
        ].join(" ");
      case 2:
        return [
          `Tu précises la fréquence et tu hésites.`,
          `OBLIGATOIRE: inclure exactement "${createReps} fois par semaine".`,
          `OBLIGATOIRE: inclure une hésitation du type "je sais pas si je dois la créer maintenant".`,
          `IMPORTANT: ne dis pas "ok vas-y" / "tu peux l'ajouter" / "oui".`,
        ].join(" ");
      case 3:
        return [
          `Tu fais une crise de panique (sans parler de suicide).`,
          `OBLIGATOIRE: inclure "crise de panique" + 1 symptôme (respiration, cœur, vertige).`,
          `Tu demandes de l'aide immédiate.`,
        ].join(" ");
      case 4:
        return [
          `Après que Sophia t'ait aidé(e), tu pivotes: tu annules la création d'action.`,
          `OBLIGATOIRE: inclure un mot clair: "annule" ou "laisse tomber".`,
          `Puis tu proposes de partir de "${existingActionTitle}" pour comprendre le blocage (sans demander de "bilan" ici).`,
          `OBLIGATOIRE: dire que "${existingActionTitle}" n'a PAS été fait (ou "raté") et que ça bloque depuis plusieurs jours.`,
          `OBLIGATOIRE: demander une "micro-étape" (ou "décomposer") pour "${existingActionTitle}".`,
        ].join(" ");
      case 5:
        return [
          `Tu confirmes: "${existingActionTitle}" n'a pas été fait.`,
          `OBLIGATOIRE: inclure "pas fait" (ou "raté").`,
          `OBLIGATOIRE: 1 raison courte (fatigue, procrastination, stress).`,
        ].join(" ");
      case 6:
        return [
          `Tu donnes 1-2 phrases de contexte sur le blocage.`,
          `Et tu mentionnes le sujet "${deferredTopic}" comme cause de fond (sans le reporter).`,
          `IMPORTANT: n'utilise PAS la phrase "on en reparle après" (c'est Sophia qui la dira dans le bilan via la consigne d'eval).`,
          `IMPORTANT: reste naturel, pas de meta.`,
        ].join(" ");
      case 7:
        return [
          `Si Sophia propose une micro-étape, tu acceptes clairement.`,
          `OBLIGATOIRE: inclure "oui" ou "ok" + "vas-y" et le mot "micro-étape".`,
        ].join(" ");
      case 8:
        return [
          `Si Sophia te demande ce qui bloque concrètement, tu réponds avec un détail actionnable (1-2 phrases).`,
          `Ex: fatigue + friction de démarrage + lieu/moment.`,
        ].join(" ");
      case 9:
        return [
          `Si Sophia propose d'ajouter la micro-étape au plan, tu acceptes explicitement.`,
          `OBLIGATOIRE: inclure "oui, ajoute-la au plan".`,
        ].join(" ");
      case 10:
        return [
          `Tu demandes explicitement de démarrer ton bilan/checkup maintenant.`,
          `OBLIGATOIRE: inclure le mot "bilan" (ou "checkup").`,
        ].join(" ");
      case 11:
        return [
          `Pendant le bilan/checkup, tu réponds brièvement et tu ramènes le sujet "${deferredTopic}" comme contexte (concret).`,
          `IMPORTANT: ne dis PAS "on en reparle après".`,
        ].join(" ");
      case 12:
        return [
          `Après le bilan, tu entres dans le sujet reporté: ${deferredTopic}.`,
          `Tu décris en 2-4 phrases ce qui se passe (concret, vécu).`,
        ].join(" ");
      case 13:
        return [
          `Tu clôtures le sujet quand Sophia demande "C'est bon pour ce point ?"`,
          `Réponds simplement: "Oui, c'est bon."`,
        ].join(" ");
      default:
        return `Continue naturellement.`;
    }
  })();

  const ctx = [
    "=== STATE MACHINE (complex multi-machine flow) ===",
    `stage=${stage}/${finalStage}`,
    `create_title="${createTitle}"`,
    `create_duration_minutes=${createDuration}`,
    `create_reps_per_week=${createReps}`,
    `create_time_of_day=${createTimeOfDay}`,
    `existing_action_title="${existingActionTitle}"`,
    `deferred_topic="${deferredTopic}"`,
    "",
    "INSTRUCTION DE CE STAGE:",
    stageInstruction,
    "",
    "CONTRAINTES:",
    "- Tu es l'utilisateur (1ère personne).",
    "- Tu ne dis pas que tu fais un test.",
    "- Tu ne donnes pas d'instructions au coach.",
    "- Tu écris comme un humain (pas administratif).",
    "- Pas de liste, pas de markdown.",
  ].join("\n");

  return { stage, finalStage, ctx, forcedDone };
}

function buildDeactivateActionV2StateMachineContext(
  obj: any,
  ts: TranscriptMsg[],
  turnIndex: number,
  maxTurns: number,
): {
  stage: number;
  finalStage: number;
  ctx: string;
  forcedDone: boolean;
  meta: { actionTitle: string; difficultyProfile: string; forbidDeleteIntent: boolean; lastUserNorm: string };
} {
  const spec = (obj?.spec && typeof obj.spec === "object") ? obj.spec : {};
  const actionTitle = String(spec?.action_title ?? "Lecture").trim() || "Lecture";
  const reason = String(spec?.reason ?? "ça me met la pression et je n'arrive pas à l'assumer en ce moment").trim();
  const difficultyProfile = String(spec?.difficulty_profile ?? "hard").trim().toLowerCase();
  const expectedTurns = Math.max(6, Math.min(20, Number(spec?.expected_turns ?? 12) || 12));
  const forbidDeleteIntent = Boolean(spec?.forbid_delete_intent ?? true);
  const allText = (ts ?? []).map((m) => `${m.role}:${m.content}`).join("\n").toLowerCase();
  const assistantAllText = (ts ?? [])
    .filter((m) => m?.role === "assistant")
    .map((m) => String(m?.content ?? ""))
    .join("\n")
    .toLowerCase();
  const lastAssistant = [...(ts ?? [])].reverse().find((m) => m?.role === "assistant")?.content ?? "";
  const lastAssistantLower = String(lastAssistant).toLowerCase();
  const lastUser = [...(ts ?? [])].reverse().find((m) => m?.role === "user")?.content ?? "";
  const lastUserNorm = String(lastUser ?? "").toLowerCase().replace(/[^a-z0-9àâäçéèêëîïôöùûüÿñæœ]+/gi, " ").trim();

  const userAskedDeactivate = /\b(d[ée]sactive|d[ée]sactiver|retire|supprime|arr[êe]te)\b/i.test(allText);
  const userMentionedPauseOnly = /\b(pause|mettre\s+en\s+pause)\b/i.test(allText) && !userAskedDeactivate;
  const assistantAskedTarget = /\b(quelle?\s+action|laquelle|de\s+quelle\s+action)\b/i.test(lastAssistantLower);
  const assistantAskedConfirm = /\b(tu\s+veux|tu\s+confirmes|je\s+la\s+d[ée]sactive|on\s+la\s+d[ée]sactive)\b/i.test(lastAssistantLower);
  const assistantConfirmedDone =
    /\b(c['’]est\s+fait|d[ée]sactiv[ée]|retir[ée]|supprim[ée]|je\s+l['’]ai\s+d[ée]sactiv[ée])\b/i.test(lastAssistantLower);
  const userConfirmed = (ts ?? []).some((m) =>
    m?.role === "user" &&
    /\b(oui|ok|vas[-\s]?y|go|fais[-\s]le)\b/i.test(String(m?.content ?? "")) &&
    /\b(d[ée]sactive|retire|supprime|action)\b/i.test(String(m?.content ?? "")),
  );

  // 12 user turns (0..11) with increasing pressure + slight digressions.
  // The flow stays "deactivate only" (no final pause path).
  let inferred = 0;
  if (assistantAskedTarget) inferred = Math.max(inferred, 4);
  if (assistantAskedConfirm) inferred = Math.max(inferred, 7);
  if (userConfirmed) inferred = Math.max(inferred, 8);
  if (assistantConfirmedDone) inferred = Math.max(inferred, 10);
  if (userMentionedPauseOnly) inferred = Math.max(inferred, 2);
  if (userAskedDeactivate) inferred = Math.max(inferred, 3);

  // Keep stage progression tied to turn budget so late-turn constraints are always exercised.
  const byTurn = Math.max(0, Math.min(11, Number(turnIndex) || 0));
  const stage = Math.max(Math.min(inferred, 11), byTurn);
  const finalStage = 11;
  const forcedDone = stage >= finalStage && (turnIndex + 1 >= Math.min(maxTurns, expectedTurns));

  const difficultyCue = (() => {
    if (difficultyProfile === "easy") {
      return "Style facile: coopératif, peu de digressions, clarifications nettes.";
    }
    if (difficultyProfile === "mid") {
      return "Style moyen: hésitations légères, 1 digression courte, puis retour rapide.";
    }
    if (difficultyProfile === "expert") {
      return "Style expert: ambiguïté contrôlée, plusieurs reformulations, micro-égarements, mais intention de désactivation constante.";
    }
    return "Style difficile: ambigu, parfois distrait, mais reste engagé et cohérent vers la désactivation.";
  })();

  const stageInstruction = (() => {
    switch (stage) {
      case 0:
        return `Tu parles d'une action qui te pèse ("${actionTitle}") sans demander un tool. Sois flou mais humain.`;
      case 1:
        return `Tu expliques pourquoi "${actionTitle}" te bloque (${reason}). Tu restes engagé(e), pas de rupture.`;
      case 2:
        return `Moment d'égarement: tu évoques "pause" puis tu te reprends. Ne donne PAS de consentement final.`;
      case 3:
        return `Tu demandes explicitement de désactiver "${actionTitle}" (pas mettre en pause).`;
      case 4:
        return `Si Sophia demande la cible, tu confirms clairement "${actionTitle}" et rien d'autre.`;
      case 5:
        return `Tu réponds à une clarification avec une nuance (hésitation courte), mais tu maintiens l'intention de désactivation.`;
      case 6:
        return `Mini digression personnelle (1 phrase), puis retour immédiat sur la désactivation.`;
      case 7:
        return `Tu donnes un consentement clair à la désactivation maintenant ("oui/ok vas-y, désactive").`;
      case 8:
        return `Tu poses une question réaliste sur l'impact (est-ce réversible / est-ce que ça sort du plan).`;
      case 9:
        return `Tu confirmes une dernière fois: tu veux bien la désactivation, sans changer d'avis vers "pause".`;
      case 10:
        return `Après confirmation assistant, tu accuses réception + léger doute humain, mais tu restes aligné(e).`;
      case 11:
        return `Tu clôtures simplement ("merci c'est bon").`;
      default:
        return "Continue naturellement.";
    }
  })();

  const ctx = [
    "=== STATE MACHINE (tool: deactivate_action V2) ===",
    `stage=${stage}/${finalStage}`,
    `target_action_title="${actionTitle}"`,
    "",
    "INSTRUCTION DE CE STAGE:",
    stageInstruction,
    "",
    "CONTRAINTES:",
    "- Tu es l'utilisateur (1ère personne).",
    "- Tu écris en français naturel, 1 message.",
    "- Scénario difficile: parfois hésitant(e) ou distrait(e), mais tu continues.",
    `- ${difficultyCue}`,
    "- Ne mentionne jamais que c'est un test.",
    "- Objectif final: désactivation (pas pause finale).",
    "- IMPORTANT: ne demande jamais une suppression définitive de l'action ni des données.",
  ].join("\n");

  return { stage, finalStage, ctx, forcedDone, meta: { actionTitle, difficultyProfile, forbidDeleteIntent, lastUserNorm } };
}

function buildDeleteActionV3StateMachineContext(
  obj: any,
  ts: TranscriptMsg[],
  turnIndex: number,
  maxTurns: number,
): {
  stage: number;
  finalStage: number;
  ctx: string;
  forcedDone: boolean;
  meta: { actionTitle: string; difficultyProfile: string; forbidPauseFinal: boolean; lastUserNorm: string };
} {
  const spec = (obj?.spec && typeof obj.spec === "object") ? obj.spec : {};
  const actionTitle = String(spec?.action_title ?? "Lecture").trim() || "Lecture";
  const reason = String(spec?.reason ?? "je n'en veux plus dans mon plan, ça ne me correspond plus").trim();
  const difficultyProfile = String(spec?.difficulty_profile ?? "hard").trim().toLowerCase();
  const expectedTurns = Math.max(6, Math.min(20, Number(spec?.expected_turns ?? 12) || 12));
  const forbidPauseFinal = Boolean(spec?.forbid_pause_final ?? true);
  const allText = (ts ?? []).map((m) => `${m.role}:${m.content}`).join("\n").toLowerCase();
  const assistantAllText = (ts ?? []).filter((m) => m?.role === "assistant").map((m) => m.content).join(" ").toLowerCase();
  const lastAssistant = [...(ts ?? [])].reverse().find((m) => m?.role === "assistant")?.content ?? "";
  const lastAssistantLower = String(lastAssistant).toLowerCase();
  const lastUser = [...(ts ?? [])].reverse().find((m) => m?.role === "user")?.content ?? "";
  const lastUserNorm = String(lastUser ?? "").toLowerCase().replace(/[^a-z0-9àâäçéèêëîïôöùûüÿñæœ]+/gi, " ").trim();

  const userAskedDelete = /\b(supprime|supprimer|retire|retirer|enl[èe]ve|enlever)\b/i.test(allText);
  const userMentionedPause = /\b(pause|mettre\s+en\s+pause|d[ée]sactiv)\b/i.test(allText);
  const assistantAskedTarget = /\b(quelle?\s+action|laquelle|de\s+quelle\s+action)\b/i.test(lastAssistantLower);
  const assistantAskedConfirm = /\b(tu\s+veux|tu\s+confirmes|je\s+la\s+retire|on\s+la\s+retire|supprimer)\b/i.test(lastAssistantLower);
  const assistantConfirmedDone =
    /\b(c['’]est\s+fait|supprim[ée]|retir[ée]|je\s+l['’]ai\s+supprim[ée]|j['’]ai\s+retir[ée])\b/i.test(lastAssistantLower);
  const assistantEverConfirmedDone =
    /\b(c['’]est\s+fait|supprim[ée]|retir[ée]|je\s+l['’]ai\s+supprim[ée]|j['’]ai\s+retir[ée])\b/i.test(assistantAllText);
  const userConfirmed = (ts ?? []).some((m) =>
    m?.role === "user" &&
    /\b(oui|ok|vas[-\s]?y|go|fais[-\s]le)\b/i.test(String(m?.content ?? "")) &&
    /\b(supprime|retire|enl[èe]ve|action)\b/i.test(String(m?.content ?? "")),
  );
  const lastUserAsksPlanCheck = /\b(mon\s+plan|affiche|montre|liste|actions?)\b/i.test(lastUserNorm);
  const lastUserAcknowledges = /\b(merci|ok|reçu|d['’]accord|parfait|c['’]est\s+bon)\b/i.test(lastUserNorm);
  const lastUserAsksDeleteAgain = /\b(supprime|supprimer|retire|retirer|enl[èe]ve|enlever)\b/i.test(lastUserNorm);

  let inferred = 0;
  if (assistantAskedTarget) inferred = Math.max(inferred, 4);
  if (assistantAskedConfirm) inferred = Math.max(inferred, 7);
  if (userConfirmed) inferred = Math.max(inferred, 8);
  if (assistantConfirmedDone) inferred = Math.max(inferred, 10);
  if (userMentionedPause) inferred = Math.max(inferred, 2);
  if (userAskedDelete) inferred = Math.max(inferred, 3);

  // Before deletion is actually confirmed by assistant, cap turn-driven progression to 9
  // to avoid drifting into late closure stages too early.
  const byTurnCap = assistantEverConfirmedDone ? 11 : 9;
  const byTurn = Math.max(0, Math.min(byTurnCap, Number(turnIndex) || 0));
  const stage = Math.max(Math.min(inferred, 11), byTurn);
  const finalStage = 11;
  const forcedDoneEarly =
    assistantEverConfirmedDone &&
    !lastUserAsksDeleteAgain &&
    (lastUserAcknowledges || lastUserAsksPlanCheck) &&
    turnIndex + 1 >= 5;
  const forcedDone =
    forcedDoneEarly ||
    (stage >= finalStage && (turnIndex + 1 >= Math.min(maxTurns, expectedTurns)));

  const difficultyCue = (() => {
    if (difficultyProfile === "easy") {
      return "Style facile: coopératif, peu de digressions, clarifications nettes.";
    }
    if (difficultyProfile === "mid") {
      return "Style moyen: hésitations légères, 1 digression courte, puis retour rapide.";
    }
    if (difficultyProfile === "expert") {
      return "Style expert: ambiguïté contrôlée, plusieurs reformulations, micro-égarements, mais intention de suppression constante.";
    }
    return "Style difficile: ambigu, parfois distrait, mais reste engagé et cohérent vers la suppression.";
  })();

  const stageInstruction = (() => {
    switch (stage) {
      case 0:
        return `Tu parles d'une action qui ne te correspond plus ("${actionTitle}") sans demander un tool.`;
      case 1:
        return `Tu expliques pourquoi "${actionTitle}" te bloque (${reason}). Tu restes engagé(e), pas de rupture.`;
      case 2:
        return `Moment d'égarement: tu évoques "pause" puis tu te reprends. Ne donne PAS de consentement final.`;
      case 3:
        return `Tu demandes explicitement de supprimer "${actionTitle}" du plan.`;
      case 4:
        return `Si Sophia demande la cible, tu confirms clairement "${actionTitle}" et rien d'autre.`;
      case 5:
        return `Tu réponds à une clarification avec une nuance, mais tu maintiens l'intention de suppression.`;
      case 6:
        return `Mini digression personnelle (1 phrase), puis retour immédiat sur la suppression.`;
      case 7:
        return `Tu donnes un consentement clair à la suppression maintenant ("oui/ok vas-y, supprime").`;
      case 8:
        return `Tu poses une question réaliste sur l'impact (historique, progression, irréversibilité).`;
      case 9:
        return `Tu confirmes une dernière fois: tu veux bien la suppression, sans revenir vers "pause".`;
      case 10:
        return `Après confirmation assistant, tu accuses réception + léger doute humain, mais tu restes aligné(e).`;
      case 11:
        return `Tu clôtures simplement ("merci c'est bon").`;
      default:
        return "Continue naturellement.";
    }
  })();

  const ctx = [
    "=== STATE MACHINE (tool: delete_action V3) ===",
    `stage=${stage}/${finalStage}`,
    `target_action_title="${actionTitle}"`,
    "",
    "INSTRUCTION DE CE STAGE:",
    stageInstruction,
    "",
    "CONTRAINTES:",
    "- Tu es l'utilisateur (1ère personne).",
    "- Tu écris en français naturel, 1 message.",
    "- Scénario difficile: parfois hésitant(e) ou distrait(e), mais tu continues.",
    `- ${difficultyCue}`,
    "- Ne mentionne jamais que c'est un test.",
    "- Objectif final: suppression (pas pause finale).",
  ].join("\n");

  return { stage, finalStage, ctx, forcedDone, meta: { actionTitle, difficultyProfile, forbidPauseFinal, lastUserNorm } };
}

function validateBilanV3StageMessage(
  stage: number,
  msg: string,
  meta: { variant: string; breakdownScheduleMode?: "with_days" | "no_days" },
): { ok: boolean; reason: string } {
  const t = String(msg ?? "").trim().toLowerCase();
  if (!t) return { ok: false, reason: "empty" };
  if (/\b(log|tool|base\s+de\s+donn|investigator)\b/i.test(t)) return { ok: false, reason: "mentions_tech_terms" };

  const hasYes = /\b(oui|ok|d['’]?accord|vas[-\s]?y|bonne idée)\b/i.test(t);
  const hasNo = /\b(non|pas besoin|non merci|je préfère)\b/i.test(t);
  const mentionsDone = /\b(c['’]?est fait|fait(e)?|oui)\b/i.test(t);
  const mentionsMissed = /\b(non|pas (fait|réussi)|rat[ée]|j['’]arrive pas|je repousse)\b/i.test(t);

  if (meta.variant === "missed_streak_decline") {
    if (stage === 0 && !/\b(check|bilan|point)\b/i.test(t)) return { ok: false, reason: "s0_missing_trigger" };
    if (stage === 1 && !mentionsMissed) return { ok: false, reason: "s1_missing_missed" };
    if (stage === 4) {
      if (!hasNo) return { ok: false, reason: "s4_missing_decline" };
      if (t.length > 80) return { ok: false, reason: "s4_too_long" };
    }
    if (stage === 5 && !mentionsDone) return { ok: false, reason: "s5_missing_done_action2" };
    return { ok: true, reason: "ok" };
  }

  if (meta.variant === "missed_streak_full_breakdown") {
    if (stage === 0) {
      if (!/\b(check|bilan|point)\b/i.test(t)) return { ok: false, reason: "s0_missing_trigger" };
      if (/\b(m[ée]ditation|lecture|d[ée]courag|stress|organisation)\b/i.test(t)) return { ok: false, reason: "s0_mentions_topic_too_early" };
    }
    if (stage === 1) {
      if (!(/\/10/.test(t) || /\b[0-9]{1,2}\b/.test(t))) return { ok: false, reason: "s1_missing_vital_value" };
      if (/\b(m[ée]ditation|lecture|stress|organisation)\b/i.test(t)) return { ok: false, reason: "s1_mentions_topic_too_early" };
    }
    if (stage === 2 && !/\bpas\s+fait\b/i.test(t)) return { ok: false, reason: "s2_missing_explicit_pas_fait" };
    if (stage === 2 && t.length > 90) return { ok: false, reason: "s2_too_long" };
    if (stage === 3 && t.length > 120) return { ok: false, reason: "s3_too_long" };
    if (stage === 4) {
      if (!hasYes) return { ok: false, reason: "s4_missing_accept_breakdown" };
      if (/\b(ajoute|ajouter|plan)\b/i.test(t)) return { ok: false, reason: "s4_mentions_add_to_plan_too_early" };
      if (t.length > 140) return { ok: false, reason: "s4_too_long_or_digressive" };
    }
    if (stage === 5 && !mentionsDone) return { ok: false, reason: "s5_missing_done_action2" };
    if (stage === 7) {
      if (!hasYes) return { ok: false, reason: "s7_missing_relaunch_accept" };
      if (t.length > 140) return { ok: false, reason: "s7_too_long_or_digressive" };
    }
    if (stage === 10) {
      if (!/\b(ajoute|ajouter)\b/i.test(t) || !/\bplan\b/i.test(t) || !hasYes) {
        return { ok: false, reason: "s10_missing_add_to_plan_accept" };
      }
    }
    if (meta.breakdownScheduleMode === "no_days" && stage === 11) {
      if (!/\b(au\s+feeling|sans\s+jours?\s+fixes?|mode\s+libre)\b/i.test(t)) {
        return { ok: false, reason: "s11_missing_no_days_choice" };
      }
    }
    if (meta.breakdownScheduleMode === "with_days" && stage === 11) {
      if (!/\b(jours?\s+fixes?|jours?\s+pr[ée]cis)\b/i.test(t)) {
        return { ok: false, reason: "s11_missing_with_days_choice" };
      }
    }
    if (meta.breakdownScheduleMode === "with_days" && stage === 12) {
      if (!/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i.test(t)) {
        return { ok: false, reason: "s12_missing_days_selection" };
      }
    }
  }

  return { ok: true, reason: "ok" };
}

function validateComplexStageMessage(
  stage: number,
  next: string,
  meta: { createTitle: string; deferredTopic: string; createTargetReps: number },
): { ok: boolean; reason: string } {
  const s = String(next ?? "").trim();
  const lower = s.toLowerCase();
  if (!s) return { ok: false, reason: "empty" };
  // Global bans: do not accidentally consent to tool creation.
  const consent =
    /\bok\s+vas[-\s]?y\b/i.test(lower) ||
    /\bvas[-\s]?y\b/i.test(lower) ||
    /\btu\s+peux\s+l['’]?ajouter\b/i.test(lower) ||
    /\bajoute[-\s]la\b/i.test(lower) ||
    /\bmets[-\s]la\b/i.test(lower);
  const startsYes = /^\s*(oui|ouais|okay)\b/i.test(s);

  if (stage === 0) {
    if (!/tu\s+en\s+penses\s+quoi\s*\?/i.test(s)) return { ok: false, reason: "stage0_missing_question" };
    if (consent) return { ok: false, reason: "stage0_unexpected_consent" };
    if (startsYes) return { ok: false, reason: "stage0_starts_with_yes" };
    // Avoid phrasing that looks like explicit immediate add.
    if (/\bajoute(r|)\b/i.test(lower)) return { ok: false, reason: "stage0_mentions_add" };
  }
  if (stage === 1) {
    // IMPORTANT:
    // Stage 1 is not safety-critical; being too strict here makes eval runs flaky under provider overload.
    // We keep ONLY the consent guard so we never accidentally authorize creation.
    // Allow "oui/ouais/ok" as acknowledgement at this stage, but never allow creation consent keywords.
    if (consent) return { ok: false, reason: "stage1_unexpected_consent" };
  }
  if (stage === 2) {
    // Same rationale as stage 1: keep flow alive under rate limits/overload; only keep consent guard.
    if (consent) return { ok: false, reason: "stage2_unexpected_consent" };
  }
  if (stage === 3) {
    if (!/\bcrise\s+de\s+panique\b/i.test(lower)) return { ok: false, reason: "stage3_missing_panic" };
  }
  if (stage === 4) {
    if (!/\b(annule|laisse\s+tomber|stop)\b/i.test(lower)) return { ok: false, reason: "stage4_missing_cancel" };
    // IMPORTANT: defer topic must be mentioned AFTER investigator is running so the router can capture it.
    if (/\bon\s+en\s+reparl\w*\b/i.test(lower)) return { ok: false, reason: "stage4_should_not_defer_yet" };
  }
  if (stage === 6) {
    // At this point, the USER should mention the deferred topic, but NOT use a deferral phrase.
    // The assistant will produce the deferral during the bilan due to the eval override.
    if (/\bon\s+en\s+reparl\w*\s+apr[èe]s\b/i.test(lower)) return { ok: false, reason: "stage6_forbidden_deferral_phrase" };
    const topic = String(meta?.deferredTopic ?? "").trim();
    if (topic) {
      const escaped = topic.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
      // Require at least *some* mention of the topic (or a key part of it).
      const loose = new RegExp(escaped.split(/\s+/).slice(0, 2).map((w) => w.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("[\\s\\S]{0,40}"), "i");
      if (!loose.test(s)) return { ok: false, reason: "stage6_missing_topic_reference" };
    }
  }

  if (stage === 10) {
    if (!/\b(bilan|checkup)\b/i.test(lower)) return { ok: false, reason: "stage10_missing_bilan" };
  }
  if (stage === 11) {
    if (/\bon\s+en\s+reparl\w*\s+apr[èe]s\b/i.test(lower)) return { ok: false, reason: "stage11_forbidden_deferral_phrase" };
    const topic = String(meta?.deferredTopic ?? "").trim();
    if (topic) {
      const escaped = topic.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
      const loose = new RegExp(escaped.split(/\s+/).slice(0, 2).map((w) => w.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("[\\s\\S]{0,40}"), "i");
      if (!loose.test(s)) return { ok: false, reason: "stage11_missing_topic_reference" };
    }
  }
  // Avoid quoting the create title with explicit add commands in any stage.
  if (new RegExp(`"${String(meta?.createTitle ?? "").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}"`, "i").test(s) && consent) {
    return { ok: false, reason: "title_plus_consent" };
  }
  return { ok: true, reason: "ok" };
}

function validateDeactivateActionV2StageMessage(
  stage: number,
  next: string,
  meta: { actionTitle: string; difficultyProfile: string; forbidDeleteIntent: boolean; lastUserNorm: string },
): { ok: boolean; reason: string } {
  const s = String(next ?? "").trim();
  const l = s.toLowerCase();
  if (!s) return { ok: false, reason: "empty" };
  if (/\b(test|évaluation|eval|llm|prompt)\b/i.test(l)) return { ok: false, reason: "meta_leak" };

  const mentionsTitle = String(meta?.actionTitle ?? "").trim()
    ? l.includes(String(meta.actionTitle).toLowerCase())
    : true;
  const deactivateIntent = /\b(d[ée]sactive|d[ée]sactiver|retire|supprime|arr[êe]te)\b/i.test(l);
  const pauseOnly = /\b(pause|mettre\s+en\s+pause)\b/i.test(l) && !deactivateIntent;
  const consent = /\b(oui|ok|vas[-\s]?y|go|fais[-\s]le)\b/i.test(l);
  const norm = l.replace(/[^a-z0-9àâäçéèêëîïôöùûüÿñæœ]+/gi, " ").trim();
  const asksIrreversibleDelete =
    /\b(d[ée]finitiv|irr[ée]versibl|supprim\w*\s+(tout|donn[ée]es?|historique|stats|compteurs?)|effac\w*)\b/i.test(l);
  const qCount = (s.match(/\?/g) ?? []).length;
  const shortAck = /\b(ok|merci|reçu|c['’]est\s+bon)\b/i.test(l);

  if (stage <= 2 && /\b(oui\s+vas[-\s]?y|tu\s+peux\s+l['’]?ajouter)\b/i.test(l)) return { ok: false, reason: "too_early_consent" };
  if (stage >= 3 && stage <= 7 && !deactivateIntent) return { ok: false, reason: "missing_deactivate_intent" };
  if (stage >= 7 && !consent && !/\b(d[ée]sactive)\b/i.test(l) && stage < 10) return { ok: false, reason: "missing_clear_consent" };
  if (stage >= 9 && pauseOnly) return { ok: false, reason: "pause_in_late_stage" };
  if ((stage === 3 || stage === 4) && !mentionsTitle) return { ok: false, reason: "missing_action_title" };
  if (Boolean(meta?.forbidDeleteIntent) && asksIrreversibleDelete) {
    return { ok: false, reason: "forbidden_delete_intent" };
  }
  if (meta?.lastUserNorm && norm && norm === String(meta.lastUserNorm)) {
    return { ok: false, reason: "repeated_message" };
  }
  if (stage === 8) {
    if (!/\b(r[ée]versibl|impact|plan|progression|historique)\b/i.test(l)) return { ok: false, reason: "stage8_missing_impact_question" };
  }
  if (stage === 9) {
    if (!/\b(oui|ok|vas[-\s]?y|d[ée]sactive)\b/i.test(l)) return { ok: false, reason: "stage9_missing_final_go" };
    if (qCount > 1) return { ok: false, reason: "stage9_too_many_questions" };
  }
  if (stage === 10) {
    if (!shortAck) return { ok: false, reason: "stage10_missing_ack" };
    if (/\b(d[ée]sactiv|inactive|pending|statut)\b/i.test(l)) return { ok: false, reason: "stage10_should_not_restart_deactivation_loop" };
    if (qCount > 1) return { ok: false, reason: "stage10_too_many_questions" };
  }
  if (stage === 11) {
    if (!/\b(merci|c['’]est\s+bon|on\s+arr[êe]te|c['’]est\s+ok)\b/i.test(l)) return { ok: false, reason: "stage11_missing_closure" };
    if (qCount > 0) return { ok: false, reason: "stage11_should_not_ask_question" };
  }
  if (String(meta?.difficultyProfile ?? "") === "easy" && stage <= 2 && pauseOnly) {
    // Easy profile should not get stuck in pause-only ambiguity too early.
    return { ok: false, reason: "easy_profile_pause_only_too_early" };
  }
  return { ok: true, reason: "ok" };
}

function validateDeleteActionV3StageMessage(
  stage: number,
  next: string,
  meta: { actionTitle: string; difficultyProfile: string; forbidPauseFinal: boolean; lastUserNorm: string },
): { ok: boolean; reason: string } {
  const s = String(next ?? "").trim();
  const l = s.toLowerCase();
  if (!s) return { ok: false, reason: "empty" };
  if (/\b(test|évaluation|eval|llm|prompt)\b/i.test(l)) return { ok: false, reason: "meta_leak" };

  const mentionsTitle = String(meta?.actionTitle ?? "").trim()
    ? l.includes(String(meta.actionTitle).toLowerCase())
    : true;
  const deleteIntent = /\b(supprime|supprimer|retire|retirer|enl[èe]ve|enlever)\b/i.test(l);
  const pauseOnly = /\b(pause|mettre\s+en\s+pause|d[ée]sactiv)\b/i.test(l) && !deleteIntent;
  const consent = /\b(oui|ok|vas[-\s]?y|go|fais[-\s]le)\b/i.test(l);
  const norm = l.replace(/[^a-z0-9àâäçéèêëîïôöùûüÿñæœ]+/gi, " ").trim();
  const qCount = (s.match(/\?/g) ?? []).length;
  const shortAck = /\b(ok|merci|reçu|c['’]est\s+bon)\b/i.test(l);

  if (stage <= 2 && /\b(oui\s+vas[-\s]?y|tu\s+peux\s+l['’]?ajouter)\b/i.test(l)) return { ok: false, reason: "too_early_consent" };
  if (stage >= 3 && stage <= 7 && !deleteIntent) return { ok: false, reason: "missing_delete_intent" };
  if (stage >= 7 && !consent && !/\b(supprime|retire|enl[èe]ve)\b/i.test(l) && stage < 10) {
    return { ok: false, reason: "missing_clear_consent" };
  }
  if (stage >= 9 && pauseOnly && Boolean(meta?.forbidPauseFinal)) return { ok: false, reason: "pause_in_late_stage" };
  if ((stage === 3 || stage === 4) && !mentionsTitle) return { ok: false, reason: "missing_action_title" };
  if (meta?.lastUserNorm && norm && norm === String(meta.lastUserNorm)) {
    return { ok: false, reason: "repeated_message" };
  }
  if (stage === 8) {
    if (!/\b(irrévers|d[ée]finit|historique|progression|stats?|retour\s+arri[èe]re)\b/i.test(l)) {
      return { ok: false, reason: "stage8_missing_impact_question" };
    }
  }
  if (stage === 9) {
    if (!/\b(oui|ok|vas[-\s]?y|supprime|retire)\b/i.test(l)) return { ok: false, reason: "stage9_missing_final_go" };
    if (qCount > 1) return { ok: false, reason: "stage9_too_many_questions" };
  }
  if (stage === 10) {
    if (!shortAck) return { ok: false, reason: "stage10_missing_ack" };
    if (/\b(supprim|retir|enlev)\b/i.test(l)) return { ok: false, reason: "stage10_should_not_restart_delete_loop" };
    if (qCount > 1) return { ok: false, reason: "stage10_too_many_questions" };
  }
  if (stage === 11) {
    if (!/\b(merci|c['’]est\s+bon|on\s+arr[êe]te|c['’]est\s+ok)\b/i.test(l)) return { ok: false, reason: "stage11_missing_closure" };
    if (qCount > 0) return { ok: false, reason: "stage11_should_not_ask_question" };
  }
  if (String(meta?.difficultyProfile ?? "") === "easy" && stage <= 2 && pauseOnly) {
    return { ok: false, reason: "easy_profile_pause_only_too_early" };
  }
  return { ok: true, reason: "ok" };
}

function isComplexMessageSafeNoConsent(next: string): { ok: boolean; reason: string } {
  const s = String(next ?? "").trim();
  const lower = s.toLowerCase();
  if (!s) return { ok: false, reason: "empty" };
  const consent =
    /\bok\s+vas[-\s]?y\b/i.test(lower) ||
    /\bvas[-\s]?y\b/i.test(lower) ||
    /\btu\s+peux\s+l['’]?ajouter\b/i.test(lower) ||
    /\bajoute[-\s]la\b/i.test(lower) ||
    /\bmets[-\s]la\b/i.test(lower);
  if (consent) return { ok: false, reason: "unexpected_consent" };
  return { ok: true, reason: "ok" };
}

function buildCreateActionStateMachineContext(obj: any, ts: TranscriptMsg[], turnIndex: number): { stage: number; finalStage: number; ctx: string; forcedDone: boolean } {
  const spec = (obj?.spec && typeof obj.spec === "object") ? obj.spec : {};
  // Use turnIndex as the primary driver so the flow is stable across assistant variations.
  // We also allow jumping forward if the transcript already clearly reached later stages.
  const inferred = inferCreateActionStageFromTranscript(ts);
  const stage = Math.min(5, Math.max(inferred, Math.max(0, Number(turnIndex) || 0)));
  const finalStage = 5;
  const forcedDone = stage >= finalStage;

  const title = String(spec?.title ?? "Lecture");
  const durationMin = Number(spec?.duration_minutes ?? 10) || 10;
  const reps = Number(spec?.target_reps ?? 3) || 3;
  const timeOfDay = String(spec?.time_of_day ?? "evening");
  const context = String(spec?.context ?? "Remplacer mon scroll du soir par un truc plus sain.");
  const wantRename = spec?.rename === false ? false : true;
  const wantActive = spec?.must_confirm_active === false ? false : true;

  const stageInstruction = (() => {
    switch (stage) {
      case 0:
        return [
          `Tu introduis l'idée: ${context}.`,
          `Tu es hésitant(e) et tu demandes un avis.`,
          `OBLIGATOIRE: inclure la question "tu en penses quoi ?"`,
          `Optionnel: 1 détail réaliste (fatigue, écran, etc).`,
        ].join(" ");
      case 1:
        return [
          `Réponds à la dernière question de Sophia en 1 phrase max (si elle a posé une question).`,
          `Puis donne tes paramètres pratiques.`,
          `OBLIGATOIRE: inclure "10 minutes" et "le soir" (ou "avant de dormir").`,
        ].join(" ");
      case 2:
        return [
          `Réponds à la dernière question de Sophia en 1 phrase max (si besoin),`,
          `puis précise la fréquence et ton hésitation.`,
          `OBLIGATOIRE: inclure exactement "${reps} fois par semaine".`,
          `OBLIGATOIRE: inclure une hésitation du type "je sais pas si je dois la créer maintenant".`,
        ].join(" ");
      case 3:
        return [
          `Tu donnes un consentement clair pour l'ajout au plan.`,
          `OBLIGATOIRE: inclure "ok vas-y" et "tu peux l'ajouter".`,
          `OBLIGATOIRE: inclure le nom EXACT "${title}" avec guillemets (ex: "${title}").`,
        ].join(" ");
      case 4:
        return wantRename
          ? [
            `Tu confirmes les paramètres ET tu veux le nom EXACT "${title}" (avec guillemets dans ton message).`,
            `OBLIGATOIRE: inclure "10 minutes" et "${reps} fois par semaine".`,
          ].join(" ")
          : `Tu confirmes les paramètres (durée, fréquence, moment).`;
      case 5:
        return wantActive
          ? [
            `Tu insistes: tu veux que ce soit visible/active sur le dashboard.`,
            `OBLIGATOIRE: inclure "pas juste pending" (ou "pas pending").`,
            `OBLIGATOIRE: mentionner le nom EXACT "${title}" avec guillemets (ex: "${title}").`,
          ].join(" ")
          : `Tu termines de façon naturelle.`;
      default:
        return `Continue naturellement.`;
    }
  })();

  const ctx = [
    "=== STATE MACHINE (tool: create_action) ===",
    `stage=${stage}/${finalStage}`,
    `target_title="${title}"`,
    `target_duration_minutes=${durationMin}`,
    `target_reps_per_week=${reps}`,
    `target_time_of_day=${timeOfDay}`,
    "",
    "INSTRUCTION DE CE STAGE:",
    stageInstruction,
    "",
    "CONTRAINTES:",
    "- Tu es l'utilisateur (1ère personne).",
    "- Tu ne dis pas que tu fais un test.",
    "- Tu ne donnes pas d'instructions au coach.",
    "- Tu écris comme un humain (pas administratif).",
    "- Interdiction de parler d'\"option A/B\" si l'assistant n'a pas listé d'options explicitement.",
  ].join("\n");

  return { stage, finalStage, ctx, forcedDone };
}

function buildUpdateActionStateMachineContext(
  obj: any,
  ts: TranscriptMsg[],
  turnIndex: number,
): { stage: number; finalStage: number; ctx: string; forcedDone: boolean; meta: { title: string; increaseTo: number; decreaseTo: number; daysInitial: string[]; dayToRemove: string } } {
  const spec = (obj?.spec && typeof obj.spec === "object") ? obj.spec : {};
  const inferred = inferUpdateActionStageFromTranscript(ts);
  const stage = Math.min(3, Math.max(inferred, Math.max(0, Number(turnIndex) || 0)));
  const finalStage = 3;
  // IMPORTANT:
  // For update_action, we must NOT mark the flow "done" just because turnIndex reached stage 3.
  // Stage 3 is the final *user message* (choose which day to remove). We should only be done once
  // the transcript indicates that message happened (i.e. inferred >= finalStage).
  const forcedDone = inferred >= finalStage;

  const title = String(spec?.title ?? "Lecture");
  const increaseTo = Number(spec?.increase_to_target_reps ?? 4) || 4;
  const decreaseTo = Number(spec?.decrease_to_target_reps ?? 3) || 3;
  const daysInitial = Array.isArray(spec?.scheduled_days_initial) ? spec.scheduled_days_initial : ["mon", "wed", "fri", "sat"];
  const dayToRemove = String(spec?.day_to_remove ?? "sat");

  const stageInstruction = (() => {
    switch (stage) {
      case 0:
        return [
          `Tu demandes une mise à jour de l'habitude "${title}".`,
          `OBLIGATOIRE: inclure "${increaseTo} fois par semaine".`,
          `OBLIGATOIRE: demander des jours fixes avec la liste (format naturel): ${daysInitial.join(", ")}.`,
          `Tu parles comme un humain, pas comme un cahier des charges.`,
        ].join(" ");
      case 1:
        return [
          `Tu réponds à la dernière question de Sophia en 1 phrase max (si besoin),`,
          `puis tu confirmes les jours fixes: ${daysInitial.join(", ")}.`,
        ].join(" ");
      case 2:
        return [
          `Tu changes d'avis: tu veux passer à "${decreaseTo} fois par semaine".`,
          `OBLIGATOIRE: rappeler que tu avais ${daysInitial.length} jours fixés, donc il faut en enlever un.`,
          `Ne choisis PAS le jour à enlever dans ce message (laisse Sophia demander lequel).`,
          `INTERDICTION: ne mentionne AUCUN jour (ni lun/mar/mer/jeu/ven/sam/dim, ni mon/tue/wed/thu/fri/sat/sun).`,
          `INTERDICTION: ne propose pas toi-même "on enlève X" / "retire X" / "supprime X".`,
        ].join(" ");
      case 3:
        return [
          `Tu réponds au choix de Sophia: tu choisis quel jour retirer.`,
          `OBLIGATOIRE: inclure "${dayToRemove}" (ex: "enlève ${dayToRemove}").`,
          `Optionnel: rappeler les jours restants.`,
        ].join(" ");
      default:
        return `Continue naturellement.`;
    }
  })();

  const ctx = [
    "=== STATE MACHINE (tool: update_action) ===",
    `stage=${stage}/${finalStage}`,
    `target_name="${title}"`,
    `increase_to_reps_per_week=${increaseTo}`,
    `decrease_to_reps_per_week=${decreaseTo}`,
    `scheduled_days_initial=${JSON.stringify(daysInitial)}`,
    `day_to_remove=${dayToRemove}`,
    "",
    "INSTRUCTION DE CE STAGE:",
    stageInstruction,
    "",
    "CONTRAINTES:",
    "- Tu es l'utilisateur (1ère personne).",
    "- Tu ne dis pas que tu fais un test.",
    "- Tu ne donnes pas d'instructions au coach.",
    "- Tu écris comme un humain (pas administratif).",
    "- Interdiction de parler d'\"option A/B\" si l'assistant n'a pas listé d'options explicitement.",
  ].join("\n");

  return { stage, finalStage, ctx, forcedDone, meta: { title, increaseTo, decreaseTo, daysInitial, dayToRemove } };
}

function buildBreakDownActionStateMachineContext(
  obj: any,
  ts: TranscriptMsg[],
  turnIndex: number,
): { stage: number; finalStage: number; ctx: string; forcedDone: boolean; meta: { title: string } } {
  const spec = (obj?.spec && typeof obj.spec === "object") ? obj.spec : {};
  const title = String(spec?.title ?? "Sport");

  // Stages (inferred from the transcript so we don't desync if the assistant delays a step):
  // 0) Trigger checkup
  // 1) Missed the action + brief reason
  // 2) Add more blocker context (1-2 sentences)
  // 3) Consent to micro-step breakdown
  // 4) Provide blocker (for step generation)
  // 5) Explicitly accept adding the micro-step to the plan (commit)
  const lastA = [...(ts ?? [])].reverse().find((m) => m?.role === "assistant")?.content ?? "";
  const lastAL = String(lastA).toLowerCase();
  const askedAcceptAdd =
    // Explicit "add to plan" confirmation
    (/\b(ajout|ajouter|ajoute|mets)\b/i.test(lastAL) && /\bplan\b/i.test(lastAL) && /\b(tu\s+veux|ça\s+te\s+va|ok\s+pour)\b/i.test(lastAL)) ||
    // Generic proposal/acceptance gate commonly used in breakdown flows
    (/\bmicro-étape|micro[-\s]?etape\b/i.test(lastAL) && /\b(qu['’]en\s+penses|ça\s+te\s+va|tu\s+es\s+ok|ok\s+pour)\b/i.test(lastAL)) ||
    // Some investigator copies mistakenly say "ajouter au bilan" instead of "au plan".
    // Treat it as the same acceptance gate so the simulated user answers stage=5 and the scenario stops.
    (/\b(ajout|ajouter|ajoute|mets)\b/i.test(lastAL) && /\b(bilan)\b/i.test(lastAL) && /\b(tu\s+veux|ça\s+te\s+va|ok\s+pour)\b/i.test(lastAL));
  const askedBlocker =
    /\b(qu['’]?est-ce|quel|quelle)\b/i.test(lastAL) && /\b(bloqu|coinc)\b/i.test(lastAL);
  const offeredBreakdown =
    /\b(micro-étape|micro[-\s]?etape)\b/i.test(lastAL) && /\b(d[ée]coupe|d[ée]couper|d[ée]composer)\b/i.test(lastAL) &&
    /\b(tu\s+veux|ok\s+pour|ça\s+te\s+dit)\b/i.test(lastAL);
  const userHasSaidMissed = (ts ?? []).some((m) => m?.role === "user" && /\b(pas\s+fait|rat[ée]|j['’]ai\s+pas\s+fait|non)\b/i.test(String(m?.content ?? "")));

  const stage =
    askedAcceptAdd ? 5 :
    askedBlocker ? 4 :
    offeredBreakdown ? 3 :
    (Number(turnIndex) || 0) === 0 ? 0 :
    userHasSaidMissed ? 2 : 1;
  const finalStage = 5;
  const forcedDone = stage === finalStage;

  const stageInstruction = (() => {
    switch (stage) {
      case 0:
        return `Écris un message court qui déclenche un bilan (ex: "Check du soir").`;
      case 1:
        return `Réponds que tu n'as pas fait "${title}" (pas fait), avec une raison courte (fatigue/procrastination). Ne demande PAS de micro-étape ici.`;
      case 2:
        return `Donne 1-2 phrases de contexte sur le blocage (fatigue, charge mentale, 'mur' au démarrage), sans demander explicitement la micro-étape.`;
      case 3:
        return `Si Sophia propose de découper en micro-étape, réponds juste "oui" / "ok" / "vas-y".`;
      case 4:
        return `Explique le blocage en 1 phrase claire (ce que tu ressens / ce qui te fait procrastiner).`;
      case 5:
        return `Accepte explicitement d'ajouter la micro-étape au plan (ex: "Oui, ajoute-la au plan.").`;
      default:
        return `Réponds naturellement.`;
    }
  })();

  const ctx = [
    "=== STATE MACHINE (tool: break_down_action via investigator) ===",
    `stage=${stage}/${finalStage}`,
    `action_title=${title}`,
    "",
    "INSTRUCTION DE CE STAGE:",
    stageInstruction,
    "",
    "CONTRAINTES:",
    "- Tu es l'utilisateur (1ère personne).",
    "- Tu ne dis pas que tu fais un test.",
    "- Tu restes en français naturel.",
    "- 1 seul message.",
  ].join("\n");

  return { stage, finalStage, ctx, forcedDone, meta: { title } };
}

function buildActivateActionStateMachineContext(
  obj: any,
  ts: TranscriptMsg[],
  turnIndex: number,
): { stage: number; finalStage: number; ctx: string; forcedDone: boolean; meta: { title: string } } {
  const spec = (obj?.spec && typeof obj.spec === "object") ? obj.spec : {};
  const title = String(spec?.title ?? "Le Premier Pas");

  function norm(s: string): string {
    return String(s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const lastA = [...(ts ?? [])].reverse().find((m) => m?.role === "assistant")?.content ?? "";
  const lastAL = String(lastA).toLowerCase();

  // Consider the tool done as soon as ANY assistant message confirms activation.
  // (The last assistant message might be from another agent, which would otherwise break forcedDone.)
  const tNorm = norm(title);
  const assistantConfirmedActivation = (ts ?? []).some((m) => {
    if (m?.role !== "assistant") return false;
    const c = norm(String(m?.content ?? ""));
    const confirms =
      /\b(j ai active|jai active|j ai activee|jai activee|c est bon j ai active|c est bien active|deja active|est deja active)\b/i.test(c) ||
      /\b(active|activee)\b/i.test(c);
    return confirms && c.includes(tNorm);
  });
  const inferred = inferActivateActionStageFromTranscript(ts, title);
  const byTurn = Math.min(2, Math.max(0, Number(turnIndex) || 0));
  const stage = assistantConfirmedActivation ? 2 : Math.min(2, Math.max(inferred, byTurn));
  const finalStage = 2;
  const forcedDone = assistantConfirmedActivation;

  const stageInstruction = (() => {
    if (stage === 0) return `Demande ce que c'est / la prochaine étape dans le plan à propos de "${title}" (1 phrase).`;
    if (stage === 1) return `Exprime un doute et demande ce que ça implique si tu l'actives (1-2 phrases).`;
    return `Demande explicitement d'activer "${title}" maintenant (1 phrase).`;
  })();

  const ctx = [
    "=== STATE MACHINE (tool: activate_plan_action via architect) ===",
    `stage=${stage}/${finalStage}`,
    `action_title=${title}`,
    "",
    "INSTRUCTION DE CE STAGE:",
    stageInstruction,
    "",
    "CONTRAINTES:",
    "- Tu es l'utilisateur (1ère personne).",
    "- Tu ne dis pas que tu fais un test.",
    "- Tu restes en français naturel.",
    "- 1 seul message.",
  ].join("\n");

  return { stage, finalStage, ctx, forcedDone, meta: { title } };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BILAN V3 — Unified state machine builder for all bilan V3 eval scenarios.
// Each variant (happy_path, all_missed, stop_midway, win_streak, etc.) gets
// per-stage instructions that guide the simulated user through the bilan flow.
// ═══════════════════════════════════════════════════════════════════════════════
function buildBilanV3StateMachineContext(
  obj: any,
  ts: TranscriptMsg[],
  turnIndex: number,
  maxTurns: number,
): {
  stage: number;
  finalStage: number;
  ctx: string;
  forcedDone: boolean;
  meta: { variant: string; breakdownScheduleMode?: "with_days" | "no_days" };
} {
  const spec = (obj?.spec && typeof obj.spec === "object") ? obj.spec : {};
  const variant = String(obj?.kind ?? "").replace("bilan_v3_", "");
  const lastAssistant = [...(ts ?? [])].reverse().find((m) => m?.role === "assistant")?.content ?? "";
  const lastAssistantLower = String(lastAssistant).toLowerCase();
  const allAssistantText = (ts ?? []).filter((m) => m?.role === "assistant").map((m) => m.content).join(" ").toLowerCase();

  // Detect bilan state from transcript
  const bilanStarted = /\b(bilan|check|point)\b/i.test(allAssistantText);
  const assistantAskedStop = /\b(on (arrête|arrete)|à bientôt|bonne soirée|terminé|c['']est (tout|fini))\b/i.test(lastAssistantLower);
  const assistantCongrats = /\b(bravo|félicit|super|bien joué|chapeau|série|streak|d['']affilée)\b/i.test(lastAssistantLower);
  const assistantBreakdownOffer = /\b(micro[- ]?étape|micro[- ]?etape|découpe|simplifi|version.*simple|plus accessible)\b/i.test(lastAssistantLower);
  const assistantIncreaseOffer = /\b(augment|passer à|objectif|cible|fois par semaine)\b/i.test(lastAssistantLower) && assistantCongrats;
  const assistantTopicDefer = /\b(après le bilan|on en (re)?parle|noté|j['']ai noté)\b/i.test(lastAssistantLower);
  const assistantRefocus = /\b(revenons|pour le bilan|on continue|et (pour|sinon)|action|habitude)\b/i.test(lastAssistantLower);

  let stage = 0;
  let finalStage = 4;
  let stageInstruction = "";

  // Phase sequences and stage instructions per variant
  const actionsStatus = spec?.actions_status ?? {};
  const actionKeys = Object.keys(actionsStatus);
  const askedAction = actionKeys.find((k) => {
    const key = String(k ?? "").trim().toLowerCase();
    return key.length > 0 && lastAssistantLower.includes(key);
  }) ?? null;
  const vitalValue = String(spec?.vital_value ?? "7 heures");
  const missReasons = spec?.miss_reasons ?? {};
  const missReason = String(spec?.miss_reason ?? "j'ai pas eu le temps");
  const deferredTopic = String(spec?.deferred_topic ?? "un sujet personnel");
  const digressionTopic = String(spec?.digression_topic ?? "un truc random");

  switch (variant) {
    // ─── HAPPY PATH (vital + all done) ─────────────────────────────────────
    case "happy_path": {
      finalStage = 5;
      const byTurn = Math.min(finalStage, Math.floor(turnIndex));
      // Infer stage from transcript
      let inferred = 0;
      if (bilanStarted) inferred = Math.max(inferred, 1);
      if (assistantAskedStop) inferred = Math.max(inferred, finalStage);
      // Resilience rule:
      // Prefer assistant-cue inference over raw turn index.
      // We allow at most +1 stage drift to avoid getting stuck on wording noise,
      // but never let turn-index jump multiple stages ahead (which creates out-of-context user replies).
      stage = Math.min(finalStage, Math.max(inferred, Math.min(byTurn, inferred + 1)));

      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan: dis "Check du soir" ou "On fait le bilan ?".`;
          break;
        case 1:
          stageInstruction = `Sophia te demande ton signe vital (sommeil ou similaire). Réponds avec la valeur: "${vitalValue}".`;
          break;
        case 2:
          stageInstruction = `Réponds à l'action demandée par Sophia (${askedAction ?? actionKeys[0] ?? "l'action 1"}) et dis clairement que c'est fait.`;
          break;
        case 3:
          stageInstruction = `Réponds à l'autre action restante (${actionKeys.find((k) => k !== askedAction) ?? actionKeys[1] ?? "l'action 2"}) et dis clairement que c'est fait.`;
          break;
        case 4:
          stageInstruction = `Sophia conclut le bilan. Accuse réception positivement ("super, merci !" ou "cool, à demain").`;
          break;
        default:
          stageInstruction = `Le bilan est terminé. Dis simplement merci.`;
      }
      break;
    }

    // ─── ALL MISSED (no streak trigger) ────────────────────────────────────
    case "all_missed": {
      finalStage = 7;
      const byTurn = Math.min(finalStage, Math.floor(turnIndex));
      let inferred = 0;
      if (bilanStarted) inferred = Math.max(inferred, 1);
      if (assistantAskedStop) inferred = Math.max(inferred, finalStage);
      stage = Math.max(Math.min(inferred, finalStage), byTurn);

      const action1 = actionKeys[0] ?? "action 1";
      const action2 = actionKeys[1] ?? "action 2";
      const reason1 = String(missReasons[action1] ?? missReason);
      const reason2 = String(missReasons[action2] ?? "j'avais pas la motivation");

      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan: dis "On fait le point ?" ou "Check du soir".`;
          break;
        case 1:
          stageInstruction = `Sophia te demande si tu as fait "${action1}". Dis que non, pas fait: "${reason1}".`;
          break;
        case 2:
          stageInstruction = `Sophia va probablement creuser pourquoi. Donne un peu plus de contexte sur ton blocage avec "${action1}" (1-2 phrases). Reste honnête et bref.`;
          break;
        case 3:
          stageInstruction = `Si Sophia a loggé l'action ou passe à la suivante, réponds naturellement. Sinon, confirme que c'est bien "pas fait" pour qu'elle puisse noter.`;
          break;
        case 4:
          stageInstruction = `Sophia te demande si tu as fait "${action2}". Dis que non: "${reason2}".`;
          break;
        case 5:
          stageInstruction = `Donne un peu de contexte sur le miss de "${action2}". Reste bref et humain.`;
          break;
        case 6:
          stageInstruction = `Confirme ou accuse réception si Sophia logge et avance. Si elle pose encore une question, réponds brièvement.`;
          break;
        default:
          stageInstruction = `Le bilan se termine. Accuse réception ("ok, merci" ou "c'est noté").`;
      }
      break;
    }

    // ─── STOP MIDWAY ───────────────────────────────────────────────────────
    case "stop_midway": {
      finalStage = 3;
      const byTurn = Math.min(finalStage, Math.floor(turnIndex));
      let inferred = 0;
      if (bilanStarted) inferred = Math.max(inferred, 1);
      stage = Math.max(Math.min(inferred, finalStage), byTurn);

      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan: dis "Bilan du soir" ou "Check rapide".`;
          break;
        case 1:
          stageInstruction = `Sophia te demande la première action. Dis que c'est fait (ou pas fait), réponds brièvement.`;
          break;
        case 2:
          stageInstruction = `OBLIGATION: dis explicitement que tu veux arrêter le bilan. Utilise "stop", "on arrête", "j'arrête le bilan" ou "pas le temps de continuer, on arrête là". Sois clair et direct.`;
          break;
        default:
          stageInstruction = `Tu as demandé d'arrêter. Si Sophia continue quand même, répète que tu veux stop.`;
      }
      break;
    }

    // ─── WIN STREAK (completed streak >= 3) ────────────────────────────────
    case "win_streak": {
      finalStage = 5;
      const byTurn = Math.min(finalStage, Math.floor(turnIndex));
      let inferred = 0;
      if (bilanStarted) inferred = Math.max(inferred, 1);
      if (assistantCongrats) inferred = Math.max(inferred, 3);
      if (assistantAskedStop) inferred = Math.max(inferred, finalStage);
      stage = Math.max(Math.min(inferred, finalStage), byTurn);

      const streakAction = String(spec?.streak_action ?? actionKeys[0] ?? "action");
      const streakDays = Number(spec?.streak_days ?? 4);

      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan avec UNE phrase neutre et courte, sans mentionner d'action ni de problème: "On fait le bilan ?" ou "Check du soir".`;
          break;
        case 1:
          stageInstruction = `Sophia te demande si tu as fait "${streakAction}". Dis que oui c'est fait, avec un ton content (tu sais que ça fait ${streakDays} jours d'affilée).`;
          break;
        case 2:
          stageInstruction = `Sophia te félicite pour ta série de ${streakDays} jours. Réagis positivement ("ouais ça fait plaisir !", "trop bien !"). Reste naturel.`;
          break;
        case 3:
          stageInstruction = `Sophia passe à l'action suivante "${actionKeys[1] ?? "action 2"}". Dis que c'est fait.`;
          break;
        case 4:
          stageInstruction = `Sophia conclut le bilan. Accuse réception ("merci, à demain !").`;
          break;
        default:
          stageInstruction = `Le bilan est terminé.`;
      }
      break;
    }

    // ─── MISSED STREAK ACCEPT BREAKDOWN ────────────────────────────────────
    case "missed_streak_accept": {
      finalStage = 7;
      const byTurn = Math.min(finalStage, Math.floor(turnIndex));
      let inferred = 0;
      if (bilanStarted) inferred = Math.max(inferred, 1);
      if (assistantBreakdownOffer) inferred = Math.max(inferred, 4);
      if (assistantAskedStop) inferred = Math.max(inferred, finalStage);
      stage = Math.max(Math.min(inferred, finalStage), byTurn);

      const streakAction = String(spec?.streak_action ?? actionKeys[0] ?? "action");

      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan: "On fait le point ?" ou "Check du soir".`;
          break;
        case 1:
          stageInstruction = `Sophia te demande "${streakAction}". Dis clairement que non, pas fait.`;
          break;
        case 2:
          stageInstruction = `Après "${streakAction}" ratée, attends la proposition de micro-étape. Si Sophia demande pourquoi malgré tout, réponds très court (ex: "Je repousse, c'est tout.") sans lancer d'exploration profonde.`;
          break;
        case 3:
          stageInstruction = `Si Sophia propose la micro-étape, réponds en accord. Sinon, confirme juste "pas fait" et attends la proposition.`;
          break;
        case 4:
          stageInstruction = `Sophia propose une micro-étape / de découper "${streakAction}" en version plus simple après le bilan. Réponds EXACTEMENT: "Oui bonne idée." (une seule phrase, aucun autre sujet).`;
          break;
        case 5:
          stageInstruction = `Sophia passe à l'action suivante "${actionKeys[1] ?? "action 2"}". Réponds EXACTEMENT: "Oui, c'est fait."`;
          break;
        case 6:
          stageInstruction = `Sophia conclut le bilan. Accuse réception.`;
          break;
        default:
          stageInstruction = `Le bilan est terminé.`;
      }
      break;
    }

    // ─── MISSED STREAK DECLINE BREAKDOWN ───────────────────────────────────
    case "missed_streak_decline": {
      finalStage = 7;
      const byTurn = Math.min(finalStage, Math.floor(turnIndex));
      let inferred = 0;
      if (bilanStarted) inferred = Math.max(inferred, 1);
      if (assistantBreakdownOffer) inferred = Math.max(inferred, 4);
      if (assistantAskedStop) inferred = Math.max(inferred, finalStage);
      stage = Math.max(Math.min(inferred, finalStage), byTurn);

      const streakAction = String(spec?.streak_action ?? actionKeys[0] ?? "action");

      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan: "Check du soir" ou "On fait le bilan".`;
          break;
        case 1:
          stageInstruction = `Sophia te demande "${streakAction}". Dis que non, c'est pas fait.`;
          break;
        case 2:
          stageInstruction = `Attends la proposition de micro-étape. Si Sophia insiste sur le pourquoi, réponds très court sans approfondir.`;
          break;
        case 3:
          stageInstruction = `Dès que Sophia propose la micro-étape, prépare un refus court. Sinon, reste bref.`;
          break;
        case 4:
          stageInstruction = `Sophia propose une micro-étape (ou un approfondissement reporté après bilan). REFUSE clairement EN UNE PHRASE COURTE et n'ajoute AUCUN autre sujet: "Non merci, je préfère réessayer tel quel." ou "Non, pas besoin pour l'instant."`;
          break;
        case 5:
          stageInstruction = `Uniquement quand Sophia demande "${actionKeys[1] ?? "action 2"}", réponds que c'est fait. Ne reparle pas de la micro-étape.`;
          break;
        case 6:
          stageInstruction = `Sophia conclut le bilan. Accuse réception.`;
          break;
        default:
          stageInstruction = `Le bilan est terminé.`;
      }
      break;
    }

    // ─── MISSED STREAK FULL BREAKDOWN (bilan + post-bilan breakdown machine) ─
    case "missed_streak_full_breakdown": {
      const breakdownScheduleMode =
        String(spec?.breakdown_schedule_mode ?? "no_days").trim().toLowerCase() === "with_days"
          ? "with_days"
          : "no_days";
      // Keep one final post-bilan reply turn so deferred relaunch can actually execute.
      finalStage = breakdownScheduleMode === "with_days" ? 13 : 12;
      const byTurn = Math.min(finalStage, Math.floor(turnIndex));

      // Post-bilan detection signals
      const assistantRelaunchOffer = /\b(tu\s+veux\s+qu['']on|on\s+en\s+(re)?parle|revenir\s+sur|sujet\s+(en\s+attente|report[ée]|mis\s+de\s+côté)|micro[- ]?[ée]tape)\b/i.test(lastAssistantLower) && assistantAskedStop;
      const assistantAskedBlockerPost = /\b(qu['']?est-ce|quel|quelle|raconte|explique)\b/i.test(lastAssistantLower) && /\b(bloqu|coinc|emp[êe]ch|frein|difficult)\b/i.test(lastAssistantLower);
      // Detect if bilan is done (post-checkup state)
      const bilanClosed = /\b(on\s+(arr[êe]te|arrete)|à\s+bient[ôo]t|bonne\s+soir[ée]e|termin[ée]|c['']est\s+(tout|fini)|récap|r[ée]cap)\b/i.test(allAssistantText) && bilanStarted;
      // Important: only treat this as "post-breakdown proposal" once bilan is actually closed.
      const assistantProposedMicroStep = bilanClosed &&
        /\b(micro[- ]?[ée]tape|micro[- ]?pas|[ée]tape.*simple|version.*simple)\b/i.test(lastAssistantLower) &&
        /\b(ajout|plan|tu\s+veux|ça\s+te\s+va|ok\s+pour|qu['']en\s+penses)\b/i.test(lastAssistantLower);

      let inferred = 0;
      if (bilanStarted) inferred = Math.max(inferred, 1);
      if (assistantBreakdownOffer && !bilanClosed) inferred = Math.max(inferred, 4);
      if (bilanClosed && !assistantRelaunchOffer && !assistantAskedBlockerPost && !assistantProposedMicroStep) inferred = Math.max(inferred, 6);
      if (assistantRelaunchOffer || (bilanClosed && /\b(micro[- ]?[ée]tape|sujet|report)\b/i.test(lastAssistantLower))) inferred = Math.max(inferred, 7);
      if (assistantAskedBlockerPost) inferred = Math.max(inferred, 8);
      if (assistantProposedMicroStep) inferred = Math.max(inferred, 10);
      stage = Math.max(Math.min(inferred, finalStage), byTurn);

      const streakAction = String(spec?.streak_action ?? actionKeys[0] ?? "action");

      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan: "On fait le point ?" ou "Check du soir".`;
          break;
        case 1:
          stageInstruction = `Sophia te demande ton signe vital (énergie ou similaire). Réponds avec la valeur: "${vitalValue}".`;
          break;
        case 2:
          stageInstruction = `Sophia te demande "${streakAction}". Réponds EXACTEMENT: "Non, pas fait."`;
          break;
        case 3:
          stageInstruction = `Après "Non, pas fait.", attends la proposition de micro-étape. Si Sophia demande quand même pourquoi, réponds très court sans lancer de deep reasons (ex: "Je repousse, c'est tout.").`;
          break;
        case 4:
          stageInstruction = `Sophia propose une micro-étape / de découper "${streakAction}" en version plus simple après le bilan. Réponds EXACTEMENT: "Oui."`;
          break;
        case 5:
          stageInstruction = `Sophia passe à l'action suivante "${actionKeys[1] ?? "action 2"}". Dis que c'est fait.`;
          break;
        case 6:
          stageInstruction = `Sophia conclut le bilan. Accuse réception positivement ("super, merci" ou "ok à demain").`;
          break;
        case 7:
          stageInstruction = `Sophia revient sur le sujet mis en attente (micro-étape pour "${streakAction}"). Réponds EXACTEMENT: "Oui."`;
          break;
        case 8:
          stageInstruction = `Sophia te demande quel est le blocage concret sur "${streakAction}". Explique en 1-2 phrases: "${missReason}". Par exemple: "Le matin j'ai aucune énergie, je repousse et après c'est trop tard."`;
          break;
        case 9:
          stageInstruction = `Sophia digère ta réponse et travaille sur la micro-étape. Réponds naturellement si elle pose une question de suivi, sinon attends.`;
          break;
        case 10:
          stageInstruction = `Sophia propose une micro-étape concrète et demande si tu veux l'ajouter au plan. Réponds EXACTEMENT: "Oui, ajoute-la au plan."`;
          break;
        case 11:
          stageInstruction = breakdownScheduleMode === "with_days"
            ? `Quand Sophia te demande le mode, choisis les jours fixes: "Jours fixes, je préfère."`
            : `Quand Sophia te demande le mode, choisis sans jours fixes: "Au feeling, sans jours fixes."`;
          break;
        case 12:
          stageInstruction = breakdownScheduleMode === "with_days"
            ? `Sophia te demande les jours précis. Donne 2 jours clairs: "Lundi et jeudi."`
            : `Après la clôture bilan, si Sophia te propose d'enchaîner maintenant sur la micro-étape, réponds "Oui, on peut le faire maintenant."`;
          break;
        case 13:
          stageInstruction = `Sophia te demande les jours précis. Donne 2 jours clairs: "Lundi et jeudi."`;
          break;
        default:
          stageInstruction = `Le flow breakdown est terminé. Dis merci et clos la conversation.`;
      }
      break;
    }

    // ─── TARGET EXCEEDED (increase offer) ──────────────────────────────────
    case "target_exceeded": {
      finalStage = 5;
      const byTurn = Math.min(finalStage, Math.floor(turnIndex));
      let inferred = 0;
      if (bilanStarted) inferred = Math.max(inferred, 1);
      if (assistantIncreaseOffer || assistantCongrats) inferred = Math.max(inferred, 2);
      if (assistantAskedStop) inferred = Math.max(inferred, finalStage);
      stage = Math.max(Math.min(inferred, finalStage), byTurn);

      const exceededAction = String(spec?.exceeded_action ?? actionKeys[0] ?? "action");
      const targetReps = Number(spec?.target_reps ?? 3);
      const currentReps = Number(spec?.current_reps ?? 4);

      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan: "Check du soir" ou "On fait le point".`;
          break;
        case 1:
          stageInstruction = `Sophia te dit que "${exceededAction}" a déjà atteint/dépassé son objectif (${currentReps}/${targetReps} cette semaine). Elle te félicite. Réagis positivement.`;
          break;
        case 2:
          stageInstruction = `Sophia propose d'augmenter l'objectif (passer à ${targetReps + 1} fois/semaine). ACCEPTE: "Oui carrément", "Ok on augmente", "Allez, on monte d'un cran".`;
          break;
        case 3:
          stageInstruction = `Sophia confirme l'augmentation et passe à "${actionKeys[1] ?? "action 2"}". Dis que c'est fait.`;
          break;
        case 4:
          stageInstruction = `Sophia conclut le bilan. Accuse réception.`;
          break;
        default:
          stageInstruction = `Le bilan est terminé.`;
      }
      break;
    }

    // ─── TARGET EXCEEDED YES_NO_DAYS (V4: accept increase, no scheduled_days) ─
    case "target_exceeded_yes_no_days": {
      finalStage = 5;
      const byTurn = Math.min(finalStage, Math.floor(turnIndex));
      let inferred = 0;
      if (bilanStarted) inferred = Math.max(inferred, 1);
      if (assistantIncreaseOffer || assistantCongrats) inferred = Math.max(inferred, 2);
      if (assistantAskedStop) inferred = Math.max(inferred, finalStage);
      stage = Math.max(Math.min(inferred, finalStage), byTurn);

      const exceededAction = String(spec?.exceeded_action ?? actionKeys[0] ?? "action");
      const targetReps = Number(spec?.target_reps ?? 3);
      const currentReps = Number(spec?.current_reps ?? 4);

      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan: "On peut faire mon bilan maintenant ?".`;
          break;
        case 1:
          stageInstruction = `Sophia te demande ton signe vital (énergie ou similaire). Réponds avec la valeur: "${vitalValue}".`;
          break;
        case 2:
          stageInstruction = `Sophia arrive à "${exceededAction}" qui a dépassé son objectif (${currentReps}/${targetReps}). Elle te félicite et propose d'augmenter. ACCEPTE clairement: "Oui carrément, on augmente !" ou "Allez, on monte d'un cran !". INTERDIT de contenir un mot négatif en même temps.`;
          break;
        case 3:
          stageInstruction = `Sophia confirme l'augmentation et passe à "${actionKeys[1] ?? "action 2"}". Réponds que c'est fait ou pas selon le contexte.`;
          break;
        case 4:
          stageInstruction = `Sophia conclut le bilan. Accuse réception: "Merci, à demain !" ou "Super, bonne soirée".`;
          break;
        default:
          stageInstruction = `Le bilan est terminé.`;
      }
      break;
    }

    // ─── TARGET EXCEEDED YES_WITH_DAYS (V4: accept increase + scheduled_days → choose day) ─
    case "target_exceeded_yes_with_days": {
      finalStage = 6;
      const byTurn = Math.min(finalStage, Math.floor(turnIndex));
      const assistantAskDay = /\b(quel jour|jour.*ajouter|jour.*rajouter|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i.test(lastAssistantLower) && !assistantIncreaseOffer;
      let inferred = 0;
      if (bilanStarted) inferred = Math.max(inferred, 1);
      if (assistantIncreaseOffer || assistantCongrats) inferred = Math.max(inferred, 2);
      if (assistantAskDay) inferred = Math.max(inferred, 3);
      if (assistantAskedStop) inferred = Math.max(inferred, finalStage);
      stage = Math.max(Math.min(inferred, finalStage), byTurn);

      const exceededAction = String(spec?.exceeded_action ?? actionKeys[0] ?? "action");
      const targetReps = Number(spec?.target_reps ?? 3);
      const currentReps = Number(spec?.current_reps ?? 4);
      const dayToAdd = String(spec?.day_to_add ?? "mardi");

      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan: "On peut faire mon bilan maintenant ?".`;
          break;
        case 1:
          stageInstruction = `Sophia te demande ton signe vital (énergie ou similaire). Réponds avec la valeur: "${vitalValue}".`;
          break;
        case 2:
          stageInstruction = `Sophia arrive à "${exceededAction}" qui a dépassé son objectif (${currentReps}/${targetReps}). Elle te félicite et propose d'augmenter. ACCEPTE clairement: "Oui on augmente" ou "Allez, on y va !". INTERDIT de contenir un mot négatif en même temps.`;
          break;
        case 3:
          stageInstruction = `Sophia te demande quel jour ajouter (elle liste les jours actuels). Réponds avec un jour précis: "Le ${dayToAdd}" ou "${dayToAdd.charAt(0).toUpperCase() + dayToAdd.slice(1)} ça me va". UN SEUL jour, sans ambiguïté.`;
          break;
        case 4:
          stageInstruction = `Sophia confirme l'augmentation avec le jour ajouté et passe à "${actionKeys[1] ?? "action 2"}". Réponds que c'est fait ou pas selon le contexte.`;
          break;
        case 5:
          stageInstruction = `Sophia conclut le bilan. Accuse réception: "Merci, à demain !" ou "Super, bonne soirée".`;
          break;
        default:
          stageInstruction = `Le bilan est terminé.`;
      }
      break;
    }

    // ─── TARGET EXCEEDED NO (V4: refuse increase) ────────────────────────
    case "target_exceeded_no": {
      finalStage = 5;
      const byTurn = Math.min(finalStage, Math.floor(turnIndex));
      let inferred = 0;
      if (bilanStarted) inferred = Math.max(inferred, 1);
      if (assistantIncreaseOffer || assistantCongrats) inferred = Math.max(inferred, 2);
      if (assistantAskedStop) inferred = Math.max(inferred, finalStage);
      stage = Math.max(Math.min(inferred, finalStage), byTurn);

      const exceededAction = String(spec?.exceeded_action ?? actionKeys[0] ?? "action");
      const targetReps = Number(spec?.target_reps ?? 3);
      const currentReps = Number(spec?.current_reps ?? 4);

      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan: "On peut faire mon bilan maintenant ?".`;
          break;
        case 1:
          stageInstruction = `Sophia te demande ton signe vital (énergie ou similaire). Réponds avec la valeur: "${vitalValue}".`;
          break;
        case 2:
          stageInstruction = `Sophia arrive à "${exceededAction}" qui a dépassé son objectif (${currentReps}/${targetReps}). Elle te félicite et propose d'augmenter. REFUSE clairement: "Non je reste comme ça, ça me va" ou "Non merci, on garde comme ça". INTERDIT de contenir un mot affirmatif en même temps.`;
          break;
        case 3:
          stageInstruction = `Sophia accepte ta décision et passe à "${actionKeys[1] ?? "action 2"}". Réponds que c'est fait ou pas selon le contexte.`;
          break;
        case 4:
          stageInstruction = `Sophia conclut le bilan. Accuse réception: "Merci, à demain !" ou "Super, bonne soirée".`;
          break;
        default:
          stageInstruction = `Le bilan est terminé.`;
      }
      break;
    }

    // ─── DEFERRED TOPIC ────────────────────────────────────────────────────
    case "deferred_topic": {
      finalStage = 7;
      const byTurn = Math.min(finalStage, Math.floor(turnIndex));
      let inferred = 0;
      if (bilanStarted) inferred = Math.max(inferred, 1);
      if (assistantTopicDefer) inferred = Math.max(inferred, 4);
      if (assistantAskedStop) inferred = Math.max(inferred, finalStage);
      stage = Math.max(Math.min(inferred, finalStage), byTurn);

      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan: "On fait le bilan ?" ou "Check du soir".`;
          break;
        case 1:
          stageInstruction = `Sophia te demande "${actionKeys[0] ?? "action 1"}". Dis que c'est fait.`;
          break;
        case 2:
          stageInstruction = `OBLIGATION: mentionne spontanément ton sujet personnel: "${deferredTopic}". Intègre-le naturellement ("d'ailleurs, ${deferredTopic}, ça me travaille en ce moment"). Ne demande PAS explicitement d'en parler, mentionne-le juste comme un aparté.`;
          break;
        case 3:
          stageInstruction = `Sophia propose d'en reparler après le bilan ("on en parle après ?"). ACCEPTE: "Oui, bonne idée" ou "Ok on en reparle après".`;
          break;
        case 4:
          stageInstruction = `Sophia revient au bilan et te demande "${actionKeys[1] ?? "action 2"}". Dis que c'est pas fait: "${String(spec?.miss_reason ?? "j'avais la tête ailleurs")}".`;
          break;
        case 5:
          stageInstruction = `Si Sophia demande pourquoi, donne une raison brève. Sinon, accuse réception.`;
          break;
        case 6:
          stageInstruction = `Sophia conclut le bilan. Accuse réception.`;
          break;
        default:
          stageInstruction = `Le bilan est terminé.`;
      }
      break;
    }

    // ─── DIGRESSION REFOCUS ────────────────────────────────────────────────
    case "digression": {
      finalStage = 5;
      const byTurn = Math.min(finalStage, Math.floor(turnIndex));
      let inferred = 0;
      if (bilanStarted) inferred = Math.max(inferred, 1);
      if (assistantRefocus) inferred = Math.max(inferred, 2);
      if (assistantAskedStop) inferred = Math.max(inferred, finalStage);
      stage = Math.max(Math.min(inferred, finalStage), byTurn);

      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan: "Check du soir" ou "On fait le bilan".`;
          break;
        case 1:
          stageInstruction = `OBLIGATION: au lieu de répondre à la question de Sophia sur l'action, DIGRESSE complètement. Parle de "${digressionTopic}" sans aucun rapport avec le bilan. Par exemple: "En fait, ${digressionTopic}". Ne réponds PAS à la question sur l'action.`;
          break;
        case 2:
          stageInstruction = `Sophia te recadre et repose la question sur "${actionKeys[0] ?? "action 1"}". Maintenant, réponds à la question: dis que c'est fait.`;
          break;
        case 3:
          stageInstruction = `Sophia te demande "${actionKeys[1] ?? "action 2"}". Dis que c'est fait.`;
          break;
        case 4:
          stageInstruction = `Sophia conclut le bilan. Accuse réception.`;
          break;
        default:
          stageInstruction = `Le bilan est terminé.`;
      }
      break;
    }

    // ─── FULL COMPLEXITY ───────────────────────────────────────────────────
    case "full_complexity": {
      finalStage = 11;
      const byTurn = Math.min(finalStage, Math.floor(turnIndex));
      let inferred = 0;
      if (bilanStarted) inferred = Math.max(inferred, 1);
      if (assistantCongrats) inferred = Math.max(inferred, 5);
      if (assistantBreakdownOffer) inferred = Math.max(inferred, 8);
      if (assistantAskedStop) inferred = Math.max(inferred, finalStage);
      stage = Math.max(Math.min(inferred, finalStage), byTurn);

      const streakWin = String(spec?.streak_action_win ?? "Sport 30 min");
      const streakMissed = String(spec?.streak_action_missed ?? "Méditation 10 min");
      const winStreakDays = Number(spec?.win_streak_days ?? 4);
      const digrTopic = String(spec?.digression_topic ?? "un truc random");

      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan: "On fait le bilan ?" ou "Check du soir".`;
          break;
        case 1:
          stageInstruction = `Sophia te demande ton signe vital. Réponds "${vitalValue}".`;
          break;
        case 2:
          stageInstruction = `Digresse brièvement: "${digrTopic}" (1-2 phrases max). Fais une parenthèse rapide.`;
          break;
        case 3:
          stageInstruction = `Sophia te recadre ou te demande "${streakWin}". Reviens au sujet et dis que c'est fait.`;
          break;
        case 4:
          stageInstruction = `Sophia te félicite pour ta série de ${winStreakDays} jours sur "${streakWin}". Réagis positivement.`;
          break;
        case 5:
          stageInstruction = `Sophia passe à "${streakMissed}". Dis que non, c'est pas fait.`;
          break;
        case 6:
          stageInstruction = `Sophia demande pourquoi. Donne la raison: "${missReason}". Sois honnête.`;
          break;
        case 7:
          stageInstruction = `Si Sophia logge et propose la micro-étape, passe au stage suivant. Sinon, confirme que c'est raté.`;
          break;
        case 8:
          stageInstruction = `Sophia propose une micro-étape pour "${streakMissed}". ACCEPTE: "Oui bonne idée".`;
          break;
        case 9:
          stageInstruction = `Sophia passe à "${actionKeys[2] ?? "action 3"}". Dis que c'est fait.`;
          break;
        case 10:
          stageInstruction = `Sophia conclut le bilan. Accuse réception.`;
          break;
        default:
          stageInstruction = `Le bilan est terminé. Dis merci.`;
      }
      break;
    }

    // ─── DEFAULT (unknown variant, graceful fallback) ──────────────────────
    default: {
      finalStage = 4;
      stage = Math.min(finalStage, Math.floor(turnIndex));
      switch (stage) {
        case 0:
          stageInstruction = `Déclenche le bilan: "Check du soir".`;
          break;
        default:
          stageInstruction = `Continue le bilan naturellement. Réponds aux questions de Sophia.`;
      }
    }
  }

  const forcedDone = stage >= finalStage && (turnIndex + 1 >= Math.min(maxTurns, finalStage + 3));

  const ctx = [
    `=== STATE MACHINE (bilan V3: ${variant}) ===`,
    `stage=${stage}/${finalStage}`,
    "",
    "INSTRUCTION DE CE STAGE:",
    stageInstruction,
    "",
    "CONTRAINTES BILAN V3:",
    "- Tu es l'utilisateur (1ère personne).",
    "- Tu écris en français naturel, 1 message.",
    "- Tu ne dis jamais que c'est un test.",
    "- Ne mentionne jamais 'log', 'tool', 'base de données', 'investigator'.",
    "- Reste bref et humain (max 2-3 phrases).",
    "- N'introduis jamais un nouveau sujet non demandé (pas de digression spontanée).",
    "- Ne répète pas un récapitulatif assistant mot pour mot.",
    "- Pas de panique/crise/détresse (ne déclenche pas le sentry).",
    "- Si tu acceptes/refuses une proposition, sois clair et sans ambiguïté.",
  ].join("\n");

  const breakdownScheduleMode =
    variant === "missed_streak_full_breakdown"
      ? (String(spec?.breakdown_schedule_mode ?? "no_days").trim().toLowerCase() === "with_days" ? "with_days" : "no_days")
      : undefined;
  return { stage, finalStage, ctx, forcedDone, meta: { variant, breakdownScheduleMode } };
}

function isShortAck(s: string): boolean {
  const t = String(s ?? "").trim().toLowerCase();
  if (!t) return false;
  if (t.length <= 12 && /^(ok|oui|non|d['’]accord|merci|go|vas[-\s]?y|c['’]est bon|ça marche)\b/i.test(t)) return true;
  return false;
}

function normalizeForRepeatCheck(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksAssistantish(s: string): { bad: boolean; reason: string } {
  // NOTE (2026-01): We intentionally DO NOT hard-block "assistant-ish" phrasing here.
  // The eval judge should decide style violations at the end of the scenario.
  // simulate-user should only guarantee that it returns a non-empty next_message.
  const t = String(s ?? "").trim();
  if (!t) return { bad: true, reason: "empty" };
  return { bad: false, reason: "ok" };
}

function isMegaEnabled(): boolean {
  const megaRaw = (((globalThis as any)?.Deno?.env?.get?.("MEGA_TEST_MODE") ?? "") as string).trim();
  const isLocalSupabase =
    ((((globalThis as any)?.Deno?.env?.get?.("SUPABASE_INTERNAL_HOST_PORT") ?? "") as string).trim() === "54321") ||
    (String(((globalThis as any)?.Deno?.env?.get?.("SUPABASE_URL") ?? "") as string).includes("http://kong:8000"));
  return megaRaw === "1" || (megaRaw === "" && isLocalSupabase);
}

function stubNextMessage(
  objectives: any[] = [],
  turn: number,
  difficulty: Difficulty = "mid",
): { next_message: string; done: boolean; satisfied: string[] } {
  const first = objectives?.[0] ?? { kind: "generic" };
  const kind = String(first.kind ?? "generic");
  // Deterministic “user” messages that try to trigger specific behaviors.
  switch (kind) {
    // WhatsApp quick reply template example (bilan invite)
    case "whatsapp_bilan_reply_yes": {
      return { next_message: "Carrément !", done: true, satisfied: ["whatsapp_bilan_reply_yes"] };
    }
    case "whatsapp_bilan_reply_not_now": {
      return { next_message: "Pas tout de suite !", done: true, satisfied: ["whatsapp_bilan_reply_not_now"] };
    }
    case "whatsapp_bilan_reply_tomorrow": {
      return { next_message: "On fera ça demain.", done: true, satisfied: ["whatsapp_bilan_reply_tomorrow"] };
    }
    case "trigger_checkup": {
      if (turn === 0) return { next_message: "Check du soir", done: false, satisfied: [] };
      if (difficulty === "easy") {
        return { next_message: "Oui. Sport: fait. Sommeil: 7h.", done: true, satisfied: ["trigger_checkup"] };
      }
      if (difficulty === "hard") {
        return { next_message: "Bilan ok… enfin jsp. J’ai fait “un peu” mais en vrai non. Et laisse tomber les questions.", done: true, satisfied: ["trigger_checkup"] };
      }
      return { next_message: "Ok. Et sinon j’ai un souci de budget… mais on peut continuer.", done: true, satisfied: ["trigger_checkup"] };
    }
    case "trigger_firefighter": {
      if (difficulty === "easy") return { next_message: "Je panique là, j’ai le cœur qui bat trop vite.", done: true, satisfied: ["trigger_firefighter"] };
      if (difficulty === "hard") return { next_message: "J’arrive pas à respirer. Ça sert à rien ton truc.", done: true, satisfied: ["trigger_firefighter"] };
      if (turn === 0) return { next_message: "Je panique là, j’ai le cœur qui bat trop vite.", done: true, satisfied: ["trigger_firefighter"] };
      return { next_message: "Je suis en panique.", done: true, satisfied: ["trigger_firefighter"] };
    }
    case "explicit_stop_checkup": {
      if (turn === 0) return { next_message: "Check du soir", done: false, satisfied: [] };
      return { next_message: "Stop, je veux parler d’autre chose.", done: true, satisfied: ["explicit_stop_checkup"] };
    }
    // Bilan V3 stubs (MEGA_TEST_MODE / local dev)
    case "bilan_v3_happy_path": {
      if (turn === 0) return { next_message: "Check du soir", done: false, satisfied: [] };
      if (turn === 1) return { next_message: "7 heures de sommeil.", done: false, satisfied: [] };
      if (turn === 2) return { next_message: "Oui, c'est fait.", done: false, satisfied: [] };
      if (turn === 3) return { next_message: "Oui, fait aussi.", done: false, satisfied: [] };
      return { next_message: "Merci, à demain !", done: true, satisfied: ["bilan_v3_happy_path"] };
    }
    case "bilan_v3_all_missed": {
      if (turn === 0) return { next_message: "On fait le point ?", done: false, satisfied: [] };
      if (turn === 1) return { next_message: "Non, pas fait. J'étais crevé.", done: false, satisfied: [] };
      if (turn === 2) return { next_message: "J'ai pas réussi à me motiver.", done: false, satisfied: [] };
      if (turn === 3) return { next_message: "Non plus. Pas la motivation.", done: false, satisfied: [] };
      return { next_message: "Ok, merci.", done: true, satisfied: ["bilan_v3_all_missed"] };
    }
    case "bilan_v3_stop_midway": {
      if (turn === 0) return { next_message: "Bilan du soir", done: false, satisfied: [] };
      if (turn === 1) return { next_message: "Oui c'est fait.", done: false, satisfied: [] };
      return { next_message: "Stop, on arrête là, j'ai pas le temps.", done: true, satisfied: ["bilan_v3_stop_midway"] };
    }
    case "bilan_v3_win_streak": {
      if (turn === 0) return { next_message: "Check du soir", done: false, satisfied: [] };
      if (turn === 1) return { next_message: "Oui c'est fait ! Ça fait 4 jours d'affilée.", done: false, satisfied: [] };
      if (turn === 2) return { next_message: "Trop bien, merci !", done: false, satisfied: [] };
      if (turn === 3) return { next_message: "Oui, fait aussi.", done: false, satisfied: [] };
      return { next_message: "Merci !", done: true, satisfied: ["bilan_v3_win_streak"] };
    }
    case "bilan_v3_missed_streak_accept": {
      if (turn === 0) return { next_message: "On fait le point ?", done: false, satisfied: [] };
      if (turn === 1) return { next_message: "Non, pas fait.", done: false, satisfied: [] };
      if (turn === 2) return { next_message: "Je repousse, c'est tout.", done: false, satisfied: [] };
      if (turn === 3) return { next_message: "Ok.", done: false, satisfied: [] };
      if (turn === 4) return { next_message: "Oui bonne idée, on découpe.", done: false, satisfied: [] };
      if (turn === 5) return { next_message: "Oui, fait.", done: false, satisfied: [] };
      return { next_message: "Merci.", done: true, satisfied: ["bilan_v3_missed_streak_accept"] };
    }
    case "bilan_v3_missed_streak_decline": {
      if (turn === 0) return { next_message: "Check du soir", done: false, satisfied: [] };
      if (turn === 1) return { next_message: "Non, pas fait.", done: false, satisfied: [] };
      if (turn === 2) return { next_message: "Je repousse, c'est tout.", done: false, satisfied: [] };
      if (turn === 3) return { next_message: "Ok.", done: false, satisfied: [] };
      if (turn === 4) return { next_message: "Non merci, je préfère réessayer tel quel.", done: false, satisfied: [] };
      if (turn === 5) return { next_message: "Oui, fait.", done: false, satisfied: [] };
      return { next_message: "Merci.", done: true, satisfied: ["bilan_v3_missed_streak_decline"] };
    }
    case "bilan_v3_missed_streak_full_breakdown": {
      if (turn === 0) return { next_message: "On fait le point ?", done: false, satisfied: [] };
      if (turn === 1) return { next_message: "7 sur 10.", done: false, satisfied: [] };
      if (turn === 2) return { next_message: "Non, pas fait.", done: false, satisfied: [] };
      if (turn === 3) return { next_message: "Je repousse, c'est tout.", done: false, satisfied: [] };
      if (turn === 4) return { next_message: "Ok.", done: false, satisfied: [] };
      if (turn === 5) return { next_message: "Oui bonne idée, on découpe après le bilan.", done: false, satisfied: [] };
      if (turn === 6) return { next_message: "Oui, fait.", done: false, satisfied: [] };
      if (turn === 7) return { next_message: "Ok, merci pour le bilan.", done: false, satisfied: [] };
      if (turn === 8) return { next_message: "Oui, on en parle.", done: false, satisfied: [] };
      if (turn === 9) return { next_message: "Le matin j'ai aucune énergie, je repousse et après c'est trop tard.", done: false, satisfied: [] };
      if (turn === 10) return { next_message: "Oui, ajoute-la au plan.", done: false, satisfied: [] };
      return { next_message: "Merci !", done: true, satisfied: ["bilan_v3_missed_streak_full_breakdown"] };
    }
    case "bilan_v3_target_exceeded": {
      if (turn === 0) return { next_message: "On fait le point", done: false, satisfied: [] };
      if (turn === 1) return { next_message: "Ouais, trop content !", done: false, satisfied: [] };
      if (turn === 2) return { next_message: "Oui carrément, on augmente.", done: false, satisfied: [] };
      if (turn === 3) return { next_message: "Oui, fait.", done: false, satisfied: [] };
      return { next_message: "Merci !", done: true, satisfied: ["bilan_v3_target_exceeded"] };
    }
    case "bilan_v3_target_exceeded_yes_no_days": {
      if (turn === 0) return { next_message: "On peut faire mon bilan maintenant ?", done: false, satisfied: [] };
      if (turn === 1) return { next_message: "7 sur 10.", done: false, satisfied: [] };
      if (turn === 2) return { next_message: "Oui carrément, on augmente !", done: false, satisfied: [] };
      if (turn === 3) return { next_message: "Oui c'est fait.", done: false, satisfied: [] };
      return { next_message: "Merci, à demain !", done: true, satisfied: ["bilan_v3_target_exceeded_yes_no_days"] };
    }
    case "bilan_v3_target_exceeded_yes_with_days": {
      if (turn === 0) return { next_message: "On peut faire mon bilan maintenant ?", done: false, satisfied: [] };
      if (turn === 1) return { next_message: "7 sur 10.", done: false, satisfied: [] };
      if (turn === 2) return { next_message: "Oui on augmente.", done: false, satisfied: [] };
      if (turn === 3) return { next_message: "Le mardi.", done: false, satisfied: [] };
      if (turn === 4) return { next_message: "Oui c'est fait.", done: false, satisfied: [] };
      return { next_message: "Merci, à demain !", done: true, satisfied: ["bilan_v3_target_exceeded_yes_with_days"] };
    }
    case "bilan_v3_target_exceeded_no": {
      if (turn === 0) return { next_message: "On peut faire mon bilan maintenant ?", done: false, satisfied: [] };
      if (turn === 1) return { next_message: "7 sur 10.", done: false, satisfied: [] };
      if (turn === 2) return { next_message: "Non je reste comme ça, ça me va.", done: false, satisfied: [] };
      if (turn === 3) return { next_message: "Oui c'est fait.", done: false, satisfied: [] };
      return { next_message: "Merci, à demain !", done: true, satisfied: ["bilan_v3_target_exceeded_no"] };
    }
    case "bilan_v3_deferred_topic": {
      if (turn === 0) return { next_message: "On fait le bilan ?", done: false, satisfied: [] };
      if (turn === 1) return { next_message: "Oui, c'est fait.", done: false, satisfied: [] };
      if (turn === 2) return { next_message: "D'ailleurs, j'ai un problème avec mon manager au boulot, ça me travaille.", done: false, satisfied: [] };
      if (turn === 3) return { next_message: "Oui, on en reparle après.", done: false, satisfied: [] };
      if (turn === 4) return { next_message: "Pas fait, j'avais la tête ailleurs.", done: false, satisfied: [] };
      return { next_message: "Ok, merci.", done: true, satisfied: ["bilan_v3_deferred_topic"] };
    }
    case "bilan_v3_digression": {
      if (turn === 0) return { next_message: "Check du soir", done: false, satisfied: [] };
      if (turn === 1) return { next_message: "En fait hier j'ai vu un truc trop marrant sur YouTube, c'était un chat qui faisait du skateboard.", done: false, satisfied: [] };
      if (turn === 2) return { next_message: "Ah oui pardon, oui c'est fait.", done: false, satisfied: [] };
      if (turn === 3) return { next_message: "Oui, fait aussi.", done: false, satisfied: [] };
      return { next_message: "Merci !", done: true, satisfied: ["bilan_v3_digression"] };
    }
    case "bilan_v3_full_complexity": {
      if (turn === 0) return { next_message: "On fait le bilan ?", done: false, satisfied: [] };
      if (turn === 1) return { next_message: "7h30 de sommeil.", done: false, satisfied: [] };
      if (turn === 2) return { next_message: "Ah tiens, j'ai vu un truc marrant sur les chats.", done: false, satisfied: [] };
      if (turn === 3) return { next_message: "Oui c'est fait le sport !", done: false, satisfied: [] };
      if (turn === 4) return { next_message: "Ouais trop bien la série !", done: false, satisfied: [] };
      if (turn === 5) return { next_message: "Non, pas fait la méditation.", done: false, satisfied: [] };
      if (turn === 6) return { next_message: "J'arrive pas à me lever, c'est la cata depuis une semaine.", done: false, satisfied: [] };
      if (turn === 7) return { next_message: "Ok.", done: false, satisfied: [] };
      if (turn === 8) return { next_message: "Oui bonne idée, on découpe.", done: false, satisfied: [] };
      if (turn === 9) return { next_message: "Oui, la lecture c'est fait.", done: false, satisfied: [] };
      return { next_message: "Merci !", done: true, satisfied: ["bilan_v3_full_complexity"] };
    }
    default:
      if (difficulty === "easy") return { next_message: `Ok.`, done: turn >= 1, satisfied: turn >= 1 ? ["generic"] : [] };
      if (difficulty === "hard") return { next_message: `Bof.`, done: turn >= 1, satisfied: turn >= 1 ? ["generic"] : [] };
      return { next_message: `Test turn ${turn}: ok.`, done: turn >= 1, satisfied: turn >= 1 ? ["generic"] : [] };
  }
}

function scriptedDeepReasonsConfidenceNextMessage(params: {
  objective: any
  turn: number
  difficulty: Difficulty
}): { next_message: string; done: boolean; satisfied: string[] } {
  const o = params.objective ?? {}
  const actionTitle = String(o?.action_title ?? o?.action ?? "une action").trim() || "une action"
  const tone = (params.difficulty === "hard") ? "sec et lucide" : "honnête et nuancé"
  const t = params.turn
  const msgs: string[] = [
    // 0: trigger deep reasons opportunity (outside bilan)
    `Je bloque complètement sur "${actionTitle}". J'ai pas de vraie raison, mais je repousse tout le temps. Je pense que c'est un manque de confiance.`,
    // 1: consent
    `Oui, on peut creuser. Mais vas-y doucement.`,
    // 2: symptom / context
    `Quand je me dis "je vais le faire", j'ai direct une petite boule au ventre et je me dis que je vais être nul(le) / ridicule.`,
    // 3: deeper belief
    `Je crois que j'ai peur qu'on voie que je suis pas à la hauteur. Du coup j'évite pour ne pas me confronter au jugement.`,
    // 4: origin-ish (without trauma dumping)
    `Ça me rappelle des moments où on s'est moqué de moi quand je me trompais. Depuis, je préfère ne pas essayer que de rater.`,
    // 5: resonance / naming
    `Oui, c'est exactement ça. C'est comme une protection: si je ne fais pas, je ne peux pas échouer.`,
    // 6: intervention acceptance
    `Ok. Si on reformule comme "j'apprends" au lieu de "je dois réussir", ça me détend déjà un peu.`,
    // 7: micro-commitment
    `Je peux faire une version mini: 2 minutes aujourd'hui, juste pour me prouver que je peux commencer.`,
    // 8: closing signal
    `Ça me va. Je me sens plus clair sur le vrai blocage (peur du jugement).`,
    // 9: clean exit
    `Merci, c'est bon pour moi. On peut clôturer.`
  ]
  const next_message = msgs[Math.min(t, msgs.length - 1)]
  const done = t >= 9
  return { next_message, done, satisfied: ["deep_reasons_confidence_realistic", tone] }
}

const BodySchema = z.object({
  // When simulate-user is invoked by run-evals, we propagate the eval_run_id to enable structured tracing
  // (conversation_eval_events) from both simulate-user and the Gemini wrapper.
  eval_run_id: z.string().uuid().optional(),
  persona: z
    .object({
      label: z.string().min(1),
      age_range: z.string().optional(), // e.g. "25-50"
      style: z.string().optional(), // e.g. "direct, oral, sometimes sarcastic"
      background: z.string().optional(),
    })
    .passthrough(),
  objectives: z.array(z.any()).default([]),
  difficulty: z.enum(["easy", "mid", "hard"]).default("mid"),
  model: z.string().optional(),
  // Optional extra context to make the simulated user consistent with the test setup
  // (e.g. plan/dashboard state, channel constraints like WhatsApp quick replies).
  context: z.string().optional(),
  suggested_replies: z.array(z.string().min(1)).max(10).optional(),
  transcript: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        agent_used: z.string().nullable().optional(),
      }),
    )
    .default([]),
  turn_index: z.number().int().min(0).default(0),
  max_turns: z.number().int().min(1).max(50).default(12),
  force_real_ai: z.boolean().optional(),
});

console.log("simulate-user: Function initialized");

(globalThis as any).Deno.serve(async (req: Request) => {
  const requestId = getRequestId(req);
  // Keep last parsed body accessible for the catch block (to support graceful fallback).
  let body: z.infer<typeof BodySchema> | null = null;
  // Keep last prompts for a "rescue" attempt in case we hit transient provider issues.
  // Must be defined outside try/catch so the rescue path can use them.
  let lastSystemPrompt = "";
  let lastUserMessage = "";
  try {
    if (req.method === "OPTIONS") return handleCorsOptions(req);
    const corsErr = enforceCors(req);
    if (corsErr) return corsErr;
    if (req.method !== "POST") return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });

    const parsed = await parseJsonBody(req, BodySchema, requestId);
    if (!parsed.ok) return parsed.response;
    body = parsed.data;

    const authHeader = req.headers.get("Authorization") ?? "";
    const url = String(((globalThis as any)?.Deno?.env?.get?.("SUPABASE_URL") ?? "") as string).trim();
    const anonKey = String(((globalThis as any)?.Deno?.env?.get?.("SUPABASE_ANON_KEY") ?? "") as string).trim();
    if (!url || !anonKey) return serverError(req, requestId, "Server misconfigured");

    // Authenticate caller
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });

    // Admin gate: only internal admins can run user simulation
    const { data: adminRow } = await userClient
      .from("internal_admins")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!adminRow) return jsonResponse(req, { error: "Forbidden", request_id: requestId }, { status: 403 });

    const allowReal = Boolean(body.force_real_ai);

    // Stub (deterministic) by default in local/MEGA_TEST_MODE unless force_real_ai=true
    if (isMegaEnabled() && !allowReal) {
      const out = stubNextMessage(body.objectives, body.turn_index, body.difficulty as Difficulty);
      return jsonResponse(req, { success: true, request_id: requestId, ...out, done: out.done || body.turn_index + 1 >= body.max_turns });
    }

    const transcriptText = (body.transcript as TranscriptMsg[])
      .slice(-20)
      .map((m) => `${m.role.toUpperCase()}${m.role === "assistant" && m.agent_used ? `(${m.agent_used})` : ""}: ${m.content}`)
      .join("\n");

    // Anti-loop shortcut: if Sophia asks a clean A/B question, pick an option instead of repeating the original ask.
    // This keeps evals from stalling on endless "tu préfères A ou B ?" when the simulated user is anxious/indecisive.
    try {
      const lastAssistant = [...(body.transcript as TranscriptMsg[] ?? [])].reverse().find((m) => m?.role === "assistant")?.content ?? "";
      const lastAL = String(lastAssistant ?? "").toLowerCase();
      const askedAB =
        (/\ba\)\b/.test(lastAL) && /\bb\)\b/.test(lastAL)) ||
        (/\boption\s*a\b/.test(lastAL) && /\boption\s*b\b/.test(lastAL)) ||
        (/\btu\s+pr[ée]f[èe]res\s+a\s+ou\s+b\b/.test(lastAL)) ||
        (/\ba\s+ou\s+b\s*\?/.test(lastAL));
      if (askedAB) {
        const choice = (body.difficulty === "hard") ? "Je sais pas..." : "A";
        return jsonResponse(req, { success: true, request_id: requestId, next_message: choice, done: false, satisfied: ["picked_ab"] });
      }
    } catch {
      // ignore
    }

    const deepReasonsObj =
      findObjective(body.objectives ?? [], "deep_reasons_confidence_realistic") ??
      findObjective(body.objectives ?? [], "deep_reasons_confidence_long") ??
      findObjective(body.objectives ?? [], "deep_reasons_exploration_confidence_realistic");
    if (deepReasonsObj) {
      const out = scriptedDeepReasonsConfidenceNextMessage({
        objective: deepReasonsObj,
        turn: body.turn_index,
        difficulty: body.difficulty as Difficulty,
      })
      return jsonResponse(req, {
        success: true,
        request_id: requestId,
        ...out,
        done: out.done || body.turn_index + 1 >= body.max_turns,
      })
    }

    // Tool eval objectives (AI-user state machines)
    // Keep backward compatibility with older scenario kind names.
    const toolCreateActionObj =
      findObjective(body.objectives ?? [], "tools_create_action") ??
      findObjective(body.objectives ?? [], "tools_create_action_realistic");
    const toolUpdateActionObj = findObjective(body.objectives ?? [], "tools_update_action_realistic");
    const toolBreakDownActionObj = findObjective(body.objectives ?? [], "tools_break_down_action_realistic");
    const toolActivateActionObj = findObjective(body.objectives ?? [], "tools_activate_action_realistic");
    const toolDeactivateV2Obj = findObjective(body.objectives ?? [], "tools_deactivate_action_v2_realistic");
    const toolDeleteV3Obj = findObjective(body.objectives ?? [], "tools_delete_action_v3_realistic");
    const toolComplexObj = findObjective(body.objectives ?? [], "tools_complex_multimachine_realistic");
    // Topic session objectives (supports both topic_serious and topic_light machine scenarios)
    const topicExplorationObj = findObjective(body.objectives ?? [], "topic_exploration_handoff_realistic") ??
      findObjective(body.objectives ?? [], "topic_session_handoff_realistic");
    
    // Stress test objectives (multi-machine scenarios)
    const stressTestObj = (body.objectives ?? []).find((o: any) => {
      const kind = String(o?.kind ?? "");
      return kind.startsWith("stress_test_");
    }) ?? null;
    
    // Ultimate full flow objective (sophisticated state machine)
    const ultimateFlowObj = findObjective(body.objectives ?? [], "ultimate_full_flow");

    // Bilan V3 objectives (unified state machine for all bilan V3 scenarios)
    const bilanV3Obj = (body.objectives ?? []).find((o: any) => {
      const kind = String(o?.kind ?? "");
      return kind.startsWith("bilan_v3_");
    }) ?? null;

    // Multi-tool flows:
    // - If both create + update objectives are present, we first run the create state machine
    //   for a fixed number of turns (stable), then switch to update.
    // This avoids brittle transcript parsing and keeps evals deterministic.
    const CREATE_TURNS = toolCreateActionObj ? 6 : 0; // stages 0..5 inclusive
    const createFlow = toolCreateActionObj
      ? buildCreateActionStateMachineContext(toolCreateActionObj, body.transcript as TranscriptMsg[], body.turn_index)
      : null;
    const createDone = Boolean(createFlow?.forcedDone) && (toolUpdateActionObj ? body.turn_index >= (CREATE_TURNS - 1) : true);
    const updateTurnIndex = toolCreateActionObj ? Math.max(0, body.turn_index - CREATE_TURNS) : body.turn_index;
    const updateFlow = toolUpdateActionObj
      ? buildUpdateActionStateMachineContext(toolUpdateActionObj, body.transcript as TranscriptMsg[], updateTurnIndex)
      : null;
    const updateDone = Boolean(updateFlow?.forcedDone);
    const breakDownFlow = toolBreakDownActionObj
      ? buildBreakDownActionStateMachineContext(toolBreakDownActionObj, body.transcript as TranscriptMsg[], body.turn_index)
      : null;
    const breakDownDone = Boolean(breakDownFlow?.forcedDone);
    const activateFlow = toolActivateActionObj
      ? buildActivateActionStateMachineContext(toolActivateActionObj, body.transcript as TranscriptMsg[], body.turn_index)
      : null;
    const activateDone = Boolean(activateFlow?.forcedDone);
    const deactivateV2Flow = toolDeactivateV2Obj
      ? buildDeactivateActionV2StateMachineContext(
        toolDeactivateV2Obj,
        body.transcript as TranscriptMsg[],
        body.turn_index,
        Number(body.max_turns) || 12,
      )
      : null;
    const deactivateV2Done = Boolean(deactivateV2Flow?.forcedDone);
    let deleteV3Flow:
      | {
        stage: number;
        finalStage: number;
        ctx: string;
        forcedDone: boolean;
        meta: { actionTitle: string; difficultyProfile: string; forbidPauseFinal: boolean; lastUserNorm: string };
      }
      | null = null;
    if (toolDeleteV3Obj) {
      try {
        deleteV3Flow = buildDeleteActionV3StateMachineContext(
          toolDeleteV3Obj,
          body.transcript as TranscriptMsg[],
          body.turn_index,
          Number(body.max_turns) || 12,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[simulate-user] delete_v3_flow_build_failed request_id=${requestId} ${msg}`);
        const spec = (toolDeleteV3Obj?.spec && typeof toolDeleteV3Obj.spec === "object") ? toolDeleteV3Obj.spec : {};
        deleteV3Flow = {
          stage: 0,
          finalStage: 11,
          ctx: [
            "=== STATE MACHINE (tool: delete_action V3 fallback) ===",
            `target_action_title="${String(spec?.action_title ?? "Lecture")}"`,
            "Reste naturel, garde une intention de suppression claire, puis clôture quand Sophia confirme.",
          ].join("\n"),
          forcedDone: false,
          meta: {
            actionTitle: String(spec?.action_title ?? "Lecture"),
            difficultyProfile: String(spec?.difficulty_profile ?? "hard"),
            forbidPauseFinal: true,
            lastUserNorm: "",
          },
        };
      }
    }
    const deleteV3Done = Boolean(deleteV3Flow?.forcedDone);
    const complexFlow = toolComplexObj
      ? buildComplexMultiMachineStateMachineContext(toolComplexObj, body.transcript as TranscriptMsg[], body.turn_index)
      : null;
    const complexDone = Boolean(complexFlow?.forcedDone);

    const topicFlow = topicExplorationObj
      ? buildTopicExplorationHandoffStateMachineContext(
        topicExplorationObj,
        body.transcript as TranscriptMsg[],
        body.turn_index,
        Number(body.max_turns) || 14,
      )
      : null;

    const stressTestFlow = stressTestObj
      ? buildStressTestStateMachineContext(
        stressTestObj,
        body.transcript as TranscriptMsg[],
        body.turn_index,
        Number(body.max_turns) || 20,
      )
      : null;

    const stressTestDone = Boolean(stressTestFlow?.forcedDone);
    
    // Ultimate full flow (sophisticated phase detection)
    const ultimateFlow = ultimateFlowObj
      ? buildUltimateFullFlowStateMachineContext(
        ultimateFlowObj,
        body.transcript as TranscriptMsg[],
        body.turn_index,
        (body as any)?.chat_state ?? {},
      )
      : null;
    
    const ultimateFlowDone = Boolean(ultimateFlow?.forcedDone);

    // Bilan V3 (unified state machine)
    const bilanV3Flow = bilanV3Obj
      ? buildBilanV3StateMachineContext(
        bilanV3Obj,
        body.transcript as TranscriptMsg[],
        body.turn_index,
        Number(body.max_turns) || 14,
      )
      : null;

    const bilanV3Done = Boolean(bilanV3Flow?.forcedDone);
    
    // NOTE: stressTestFlow is intentionally NOT included in toolFlow.
    // It has its own done handling logic and shouldn't be subject to the toolFlow allDone check.
    const toolFlow =
      ((!complexDone && complexFlow)
        ? complexFlow
        : ((!createDone && createFlow)
          ? createFlow
          : ((!updateDone && updateFlow)
            ? updateFlow
            : ((!breakDownDone && breakDownFlow)
              ? breakDownFlow
              : ((!activateDone && activateFlow)
                ? activateFlow
                : ((!deactivateV2Done && deactivateV2Flow)
                  ? deactivateV2Flow
                  : ((!deleteV3Done && deleteV3Flow) ? deleteV3Flow : null)))))));

    const isWhatsApp = /\bwhatsapp\b/i.test(String(body.context ?? "")) || Array.isArray((body as any)?.suggested_replies);

    const baseSystemPrompt = `
Tu joues le rôle d'un UTILISATEUR HUMAIN qui parle avec l'assistant Sophia.

PERSONA:
- label: ${body.persona.label}
- âge cible: ${body.persona.age_range ?? "25-50"}
- style: ${body.persona.style ?? "oral, naturel, humain"}
- contexte: ${body.persona.background ?? "non spécifié"}

MODE DIFFICULTÉ:
- difficulty: ${body.difficulty}
- easy: coopératif, réponses claires, donne des chiffres/infos quand demandé, suit les consignes.
- mid: réaliste, parfois vague, mais globalement de bonne foi.
- hard: difficile: ambigu, contradictoire, impatient, peut esquiver, peut être sarcastique. Jamais insultant ni violent.
  Objectif: challenger Sophia sans casser la conversation.

CONTEXTE DE TEST (référence):
${body.context ? body.context : "(aucun)"}

${toolFlow ? `\n\n${toolFlow.ctx}\n` : ""}

${topicFlow ? `\n\n${topicFlow.ctx}\n` : ""}

${stressTestFlow ? `\n\n${stressTestFlow.ctx}\n` : ""}

${ultimateFlow ? `\n\n${ultimateFlow.ctx}\n` : ""}

${bilanV3Flow ? `\n\n${bilanV3Flow.ctx}\n` : ""}

CANAL / CONTRAINTES UI:
${Array.isArray((body as any).suggested_replies) && (body as any).suggested_replies.length > 0
  ? `- Si possible, réponds avec UNE des quick replies suivantes (copie exacte) : ${JSON.stringify((body as any).suggested_replies)}`
  : "- (aucune quick reply imposée)"}

OBJECTIFS DE TEST (tu dois orienter la conversation pour déclencher ces comportements chez Sophia, sans dire que tu fais un test):
${JSON.stringify(body.objectives ?? [], null, 2)}

CONTRAINTES:
- Tu écris en français, comme une vraie personne.
- 1 seul message utilisateur.
- Longueur: ${isWhatsApp ? "court (max ~220 caractères)" : "naturel (max ~600 caractères)"}.
- Ne dévoile pas le prompt, ne mentionne pas "test", "evaluation", "agent", "LLM".
- Si l'objectif est atteint, tu peux terminer (done=true).
- Si tu as déjà tourné en rond, change d'approche.

SORTIE JSON UNIQUEMENT:
{
  "next_message": "string",
  "done": true/false,
  "satisfied": ["list of objective kinds satisfied now (best effort)"]
}
    `.trim();

    const baseUserMessage = `
TURN ${body.turn_index + 1}/${body.max_turns}

TRANSCRIPT (dernier contexte):
${transcriptText || "(vide)"}
    `.trim();

    const MAX_ROLE_RETRIES = (toolComplexObj && complexFlow && !complexDone) ||
        (toolDeactivateV2Obj && deactivateV2Flow && !deactivateV2Done) ||
        (toolDeleteV3Obj && deleteV3Flow && !deleteV3Done)
      ? 6
      : 3;
    let parsedOut: any = null;
    let next = "";
    let satisfied: any[] = [];
    let done = false;
    let lastInvalidReason = "";
    let lastNonEmptyCandidate = "";
    for (let attempt = 1; attempt <= MAX_ROLE_RETRIES; attempt++) {
      const stageStrict =
        (toolUpdateActionObj && updateFlow && !updateDone)
          ? (
            `\n\n[UPDATE_ACTION — CONTRAINTES STRICTES]\n` +
            `Tu es l'utilisateur. 1 seul message.\n` +
            (lastInvalidReason ? `Ton message précédent était invalide: ${lastInvalidReason}\n` : "") +
            (updateFlow.stage === 2
              ? `OBLIGATIONS (stage=2): dire "${updateFlow.meta.decreaseTo} fois par semaine" et dire qu'il faut enlever/retirer/supprimer un jour.\nINTERDICTIONS: ne mentionne AUCUN jour (ni lundi... ni mon/tue/wed...), et ne propose pas quel jour enlever.\n`
              : "") +
            (updateFlow.stage === 3
              ? `OBLIGATIONS (stage=3): choisir le jour à enlever et utiliser un verbe (enlève/retire/supprime).\n`
              : "") +
            ``
          )
          : "";

      const stageStrictBreakdown =
        (toolBreakDownActionObj && breakDownFlow && !breakDownDone)
          ? (
            `\n\n[BREAK_DOWN_ACTION — CONTRAINTES STRICTES]\n` +
            `Tu es l'utilisateur. 1 seul message.\n` +
            (lastInvalidReason ? `Ton message précédent était invalide: ${lastInvalidReason}\n` : "") +
            `SUJET: "${breakDownFlow.meta.title}".\n` +
            (breakDownFlow.stage === 1
              ? `OBLIGATIONS (stage=1): dire clairement "pas fait" (ou équivalent) + une raison courte (fatigue/procrastination).\nINTERDICTIONS: ne parle PAS de micro-étape / découpage, ne parle pas de changer le texte/description.\n`
              : "") +
            (breakDownFlow.stage === 2
              ? `OBLIGATIONS (stage=2): donner un peu plus de contexte sur le blocage (1-2 phrases).\nINTERDICTIONS: ne dis pas "on continue"/"passons", et ne demande PAS de micro-étape encore.\n`
              : "") +
            (breakDownFlow.stage === 3
              ? `OBLIGATIONS (stage=3): accepter explicitement la micro-étape (ex: "oui, vas-y découpe en micro-étape").\n`
              : "") +
            (breakDownFlow.stage === 5
              ? `OBLIGATIONS (stage=5): accepter explicitement d'ajouter la micro-étape au plan (ex: "oui, ajoute-la au plan").\n`
              : "") +
            `RÈGLES GÉNÉRALES:\n` +
            `- Ne demande pas de "dashboard".\n` +
            `- Ne parle jamais de changer le texte/description/renommer.\n` +
            `- Ne répète pas un récapitulatif assistant.\n` +
            ``
          )
          : "";

      const stageStrictComplex =
        (toolComplexObj && complexFlow && !complexDone)
          ? (
            `\n\n[COMPLEX_MULTI_MACHINE — CONTRAINTES STRICTES]\n` +
            `Tu es l'utilisateur. 1 seul message.\n` +
            (lastInvalidReason ? `Ton message précédent était invalide: ${lastInvalidReason}\n` : "") +
            `stage=${complexFlow.stage}/${complexFlow.finalStage}\n` +
            `RÈGLES:\n` +
            `- Tant que tu n'as pas explicitement changé d'avis, tu NE DONNES PAS de consentement pour créer/ajouter une nouvelle action.\n` +
            `- Ne réponds PAS "oui" à une question d'ajout.\n` +
            (complexFlow.stage === 4
              ? `INTERDICTION (stage=4): ne mentionne PAS "stress au travail" et ne dis pas "on en reparlera après" dans ce message.\n`
              : "") +
            (complexFlow.stage === 6
              ? `OBLIGATION (stage=6): mentionner "mon stress au travail" comme contexte (SANS écrire "on en reparle après").\n`
              : "") +
            (complexFlow.stage === 10
              ? `OBLIGATION (stage=10): demander explicitement de démarrer le "bilan" (ou "checkup").\n`
              : "") +
            (complexFlow.stage === 11
              ? `OBLIGATION (stage=11): pendant le bilan, reparler de "mon stress au travail" (SANS écrire "on en reparle après").\n`
              : "")
          )
          : "";


      const stageStrictDeactivate =
        (toolDeactivateV2Obj && deactivateV2Flow && !deactivateV2Done)
          ? (
            `\n\n[DEACTIVATE_ACTION_V2 — CONTRAINTES STRICTES]\n` +
            `Tu es l'utilisateur. 1 seul message.\n` +
            `stage=${deactivateV2Flow.stage}/${deactivateV2Flow.finalStage}\n` +
            `action_title="${deactivateV2Flow.meta.actionTitle}"\n` +
            (lastInvalidReason ? `Ton message précédent était invalide: ${lastInvalidReason}\n` : "") +
            `RÈGLES:\n` +
            `- Rester humain, parfois hésitant, mais continuer.\n` +
            `- Objectif final: désactivation de l'action (pas pause finale).\n` +
            `- N'utilise jamais le mot "pending"; utilise "en pause" si nécessaire.\n` +
            `- Ne jamais mentionner test/eval/LLM.\n`
          )
          : "";
      const stageStrictDelete =
        (toolDeleteV3Obj && deleteV3Flow && !deleteV3Done)
          ? (
            `\n\n[DELETE_ACTION_V3 — CONTRAINTES STRICTES]\n` +
            `Tu es l'utilisateur. 1 seul message.\n` +
            `stage=${deleteV3Flow.stage}/${deleteV3Flow.finalStage}\n` +
            `action_title="${deleteV3Flow.meta.actionTitle}"\n` +
            (lastInvalidReason ? `Ton message précédent était invalide: ${lastInvalidReason}\n` : "") +
            `RÈGLES:\n` +
            `- Rester humain, parfois hésitant, mais continuer.\n` +
            `- Objectif final: suppression de l'action (pas mise en pause).\n` +
            `- Ne jamais mentionner test/eval/LLM.\n`
          )
          : "";

      const stageStrictBilanV3 =
        (bilanV3Obj && bilanV3Flow && !bilanV3Done)
          ? (
            `\n\n[BILAN_V3 — CONTRAINTES STRICTES]\n` +
            `Tu es l'utilisateur. 1 seul message.\n` +
            `stage=${bilanV3Flow.stage}/${bilanV3Flow.finalStage} (variant=${bilanV3Flow.meta.variant})\n` +
            (lastInvalidReason ? `Ton message précédent était invalide: ${lastInvalidReason}\n` : "") +
            `RÈGLES:\n` +
            `- Suis EXACTEMENT l'instruction de stage ci-dessus.\n` +
            `- Ne mentionne jamais test/eval/LLM.\n` +
            `- Ne déclenche PAS de crise (pas de panique/détresse/crise).\n` +
            `- Reste bref (2-3 phrases max).\n` +
            `- Si tu dois accepter/refuser une proposition, sois explicite.\n`
          )
          : "";

      const systemPrompt = `${baseSystemPrompt}${stageStrict}${stageStrictBreakdown}${stageStrictComplex}${stageStrictDeactivate}${stageStrictDelete}${stageStrictBilanV3}`.trim();
      const userMessage = baseUserMessage;
      lastSystemPrompt = systemPrompt;
      lastUserMessage = userMessage;

      // Drastic (per request): always start simulate-user from a stable default unless the caller overrides.
      // Fallback order is handled inside gemini.ts.
      const requestedModel = String((body as any).model ?? "").trim() || "gpt-5-mini";

      const simMaxRetries = (() => {
        const raw = String((globalThis as any)?.Deno?.env?.get?.("SIMULATE_USER_LLM_MAX_RETRIES") ?? "").trim();
        const n = Number(raw);
        return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 10;
      })();
      const simHttpTimeoutMs = (() => {
        const raw = String((globalThis as any)?.Deno?.env?.get?.("SIMULATE_USER_LLM_HTTP_TIMEOUT_MS") ?? "").trim();
        const n = Number(raw);
        // Default: long-ish because retries + fallbacks need time; can be overridden.
        return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 25_000;
      })();

      const out = await generateWithGemini(systemPrompt, userMessage, attempt >= 2 ? 0.2 : 0.4, true, [], "auto", {
        requestId: `${requestId}:role_retry:${attempt}`,
        // IMPORTANT: start from the requested model (runner passes it); fallbacks happen inside gemini.ts.
        model: requestedModel,
        source: "simulate-user",
        forceRealAi: allowReal,
        evalRunId: (body as any)?.eval_run_id ?? null,
        // Keep retries short to avoid edge-runtime early termination; gemini.ts has an internal fallback chain.
        maxRetries: simMaxRetries,
        httpTimeoutMs: simHttpTimeoutMs,
      } as any);
      try {
      parsedOut = JSON.parse(out as string);
      } catch {
        lastInvalidReason = "invalid_json";
        continue;
      }
      next = String(parsedOut?.next_message ?? "").trim();
      if (!next) continue;
      // Anti-loop: never repeat the exact previous user message.
      const lastUserMsg = [...(body.transcript as TranscriptMsg[])].reverse().find((m) => m?.role === "user")?.content ?? "";
      if (normalizeForRepeatCheck(next) && normalizeForRepeatCheck(next) === normalizeForRepeatCheck(lastUserMsg)) {
        lastInvalidReason = "repeat_last_user_message";
        next = "";
        continue;
      }
      // Stronger anti-repeat for long stress scenarios: avoid reusing any prior user message.
      if ((ultimateFlowObj || stressTestObj) && normalizeForRepeatCheck(next)) {
        const prior = new Set(
          (body.transcript as TranscriptMsg[])
            .filter((m) => m?.role === "user")
            .map((m) => normalizeForRepeatCheck(String(m?.content ?? "")))
            .filter(Boolean),
        );
        if (prior.has(normalizeForRepeatCheck(next))) {
          lastInvalidReason = "repeat_prior_user_message";
          next = "";
          continue;
        }
      }
      lastNonEmptyCandidate = next;
      if (bilanV3Obj && bilanV3Flow && !bilanV3Done) {
        const v = validateBilanV3StageMessage(bilanV3Flow.stage, next, bilanV3Flow.meta);
        if (!v.ok) {
          lastInvalidReason = `bilan_v3_${v.reason}`;
          next = "";
          continue;
        }
      }
      // No "assistant-ish" hard gate here; judge will evaluate style at the end.
      // BUT: keep the update_action state machine mechanically valid so the scenario can reach the assertions.
      if (toolUpdateActionObj && updateFlow && !updateDone) {
        const v = validateUpdateActionStageMessage(updateFlow.stage, next, updateFlow.meta);
        if (!v.ok) {
          // Soft validation: never block the whole run on strict stage constraints.
          // Only enforce the safety invariant: no accidental consent phrasing.
          const safe = isComplexMessageSafeNoConsent(next);
          if (!safe.ok) {
            lastInvalidReason = `update_${v.reason}_unsafe_${safe.reason}`;
            next = "";
            continue;
          }
          lastInvalidReason = `update_${v.reason}`;
        }
      }
      if (toolBreakDownActionObj && breakDownFlow && !breakDownDone) {
        const v = validateBreakDownActionStageMessage(breakDownFlow.stage, next, breakDownFlow.meta);
        if (!v.ok) {
          const safe = isComplexMessageSafeNoConsent(next);
          if (!safe.ok) {
            lastInvalidReason = `breakdown_${v.reason}_unsafe_${safe.reason}`;
            next = "";
            continue;
          }
          lastInvalidReason = `breakdown_${v.reason}`;
        }
      }
      if (toolComplexObj && complexFlow && !complexDone) {
        const spec = (toolComplexObj?.spec && typeof toolComplexObj.spec === "object") ? toolComplexObj.spec : {};
        const meta = {
          createTitle: String(spec?.create_title ?? "Lecture (anti-scroll)"),
          deferredTopic: String(spec?.deferred_topic ?? "mon stress au travail"),
          createTargetReps: Number(spec?.create_target_reps ?? 3) || 3,
        };
        const v = validateComplexStageMessage(complexFlow.stage, next, meta);
        if (!v.ok) {
          // Soft validation: do not block on strict stage requirements (they are brittle under overload).
          // Only enforce safety: never accidentally consent to creating/adding an action.
          const safe = isComplexMessageSafeNoConsent(next);
          if (!safe.ok) {
            lastInvalidReason = `complex_${v.reason}_unsafe_${safe.reason}`;
            next = "";
            continue;
          }
          lastInvalidReason = v.reason;
        }
      }
      if (toolActivateActionObj && activateFlow && !activateDone) {
        const v = validateActivateActionStageMessage(activateFlow.stage, next, activateFlow.meta);
        if (!v.ok) {
          const safe = isComplexMessageSafeNoConsent(next);
          if (!safe.ok) {
            lastInvalidReason = `activate_${v.reason}_unsafe_${safe.reason}`;
            next = "";
            continue;
          }
          lastInvalidReason = `activate_${v.reason}`;
        }
      }
      if (toolDeactivateV2Obj && deactivateV2Flow && !deactivateV2Done) {
        const v = validateDeactivateActionV2StageMessage(deactivateV2Flow.stage, next, deactivateV2Flow.meta);
        if (!v.ok) {
          const safe = isComplexMessageSafeNoConsent(next);
          if (!safe.ok) {
            lastInvalidReason = `deactivate_v2_${v.reason}_unsafe_${safe.reason}`;
            next = "";
            continue;
          }
          lastInvalidReason = `deactivate_v2_${v.reason}`;
        }
      }
      if (toolDeleteV3Obj && deleteV3Flow && !deleteV3Done) {
        const v = validateDeleteActionV3StageMessage(deleteV3Flow.stage, next, deleteV3Flow.meta);
        if (!v.ok) {
          // Keep delete V3 trajectory strict to avoid late-stage drift
          // (backup/escalation loops) that degrades conversation realism.
          lastInvalidReason = `delete_v3_${v.reason}`;
          next = "";
          continue;
        }
      }
      // After update_action flow is complete, avoid the simulated user parroting an assistant recap
      // (it creates artificial redundant-confirmation issues in eval-judge).
      if (toolUpdateActionObj && updateDone && looksLikeUserParrotsAssistantRecap(next)) {
        lastInvalidReason = "postdone_user_parrots_assistant";
        next = "";
        continue;
      }
      break;
    }

    // If we still couldn't produce a valid next_message, do one extra "rescue" attempt (still full AI, no hardcoded text).
    if (!next && toolComplexObj && complexFlow && !complexDone) {
      try {
        const rescueSystem = `
Tu joues le rôle d'un UTILISATEUR HUMAIN qui parle avec Sophia.
Tu dois produire UN SEUL message utilisateur pour respecter une machine à états de test.
Tu ne dis pas que tu fais un test.
Tu ne donnes pas d'instructions au coach.

Objectif: produire un JSON valide:
{"next_message":"...","done":true/false,"satisfied":[]}

Contrainte critique: ton message doit être valide pour le stage=${complexFlow.stage} (voir contexte).
Raison du dernier échec (si présent): ${lastInvalidReason || "none"}.
        `.trim();
        const rescueUser = `
TURN ${body.turn_index + 1}/${body.max_turns}

TRANSCRIPT:
${transcriptText || "(vide)"}

CONTEXTE MACHINE:
${complexFlow.ctx}
        `.trim();

        const out2 = await generateWithGemini(rescueSystem, rescueUser, 0.15, true, [], "auto", {
          requestId: `${requestId}:role_rescue:complex`,
          model: "gemini-2.0-flash",
          source: "simulate-user:role_rescue_complex",
          forceRealAi: allowReal,
          evalRunId: (body as any)?.eval_run_id ?? null,
          maxRetries: 2,
          httpTimeoutMs: 8_000,
        } as any);
        const parsed2 = JSON.parse(out2 as string);
        const cand = String(parsed2?.next_message ?? "").trim();
        if (cand) {
          const spec = (toolComplexObj?.spec && typeof toolComplexObj.spec === "object") ? toolComplexObj.spec : {};
          const meta = {
            createTitle: String(spec?.create_title ?? "Lecture (anti-scroll)"),
            deferredTopic: String(spec?.deferred_topic ?? "mon stress au travail"),
            createTargetReps: Number(spec?.create_target_reps ?? 3) || 3,
          };
          // Rescue should never hard-fail on strict stage constraints; only enforce safety.
          const safe = isComplexMessageSafeNoConsent(cand);
          if (safe.ok) {
            next = cand;
            parsedOut = parsed2;
          } else {
            lastInvalidReason = `rescue_unsafe_${safe.reason}`;
          }
        }
      } catch {}
    }
    // Last resort: never abort the whole eval due to strict constraints.
    // Safety invariant is enforced by isComplexMessageSafeNoConsent().
    const allowInvalidFallback = true;
    if (!next && lastNonEmptyCandidate && allowInvalidFallback) next = lastNonEmptyCandidate;
    if (!next && !allowInvalidFallback) {
      return jsonResponse(
        req,
        { error: "simulate-user failed to generate a valid next_message for complex flow", reason: lastInvalidReason, request_id: requestId },
        { status: 500 },
      );
    }
    if (!next) return jsonResponse(req, { error: "Empty next_message", request_id: requestId }, { status: 500 });
    done = Boolean(parsedOut?.done) || body.turn_index + 1 >= body.max_turns;
    let doneLocked = false;
    // Topic-exploration scenario: do NOT allow early done; we want a full-length, fluid run for realism.
    if (topicExplorationObj) {
      done = Boolean(topicFlow?.forcedDone) || body.turn_index + 1 >= body.max_turns;
    }
    // Stress test scenarios: do NOT allow early done; we want a full-length run to test all machines.
    if (stressTestObj) {
      done = Boolean(stressTestFlow?.forcedDone) || body.turn_index + 1 >= body.max_turns;
    }
    // Bilan V3 scenarios: do NOT allow early done; follow the state machine stages.
    if (bilanV3Obj) {
      done = Boolean(bilanV3Flow?.forcedDone) || body.turn_index + 1 >= body.max_turns;
    }
    // Ultimate full flow: only done when phase is DONE (emoji confirmed), ignore max_turns
    if (ultimateFlowObj) {
      done = Boolean(ultimateFlow?.forcedDone);
      // Safety: cap at 50 turns to prevent infinite loops
      if (body.turn_index >= 50) done = true;
      doneLocked = true;
    }
    // Tool state machines: prevent early stop until ALL requested flows complete.
    if (toolFlow && !doneLocked) {
      const allDone =
        (toolComplexObj ? complexDone : true) &&
        (toolCreateActionObj ? createDone : true) &&
        (toolUpdateActionObj ? updateDone : true) &&
        (toolBreakDownActionObj ? breakDownDone : true) &&
        (toolActivateActionObj ? activateDone : true) &&
        (toolDeactivateV2Obj ? deactivateV2Done : true) &&
        (toolDeleteV3Obj ? deleteV3Done : true);
      done = allDone || body.turn_index + 1 >= body.max_turns;
    }
    // IMPORTANT: once a tool flow is complete, stop the scenario immediately to avoid extra turns
    // that can trigger unrelated routing issues (librarian/architect/firefighter) after a checkup ends.
    if (!doneLocked && toolBreakDownActionObj && breakDownDone) {
      done = true;
    }
    if (!doneLocked && toolActivateActionObj && activateDone) {
      // Once activated, stop immediately and avoid any follow-up that can trigger routing/tool loops.
      next = `Ok, merci.`;
      done = true;
    }
    if (!doneLocked && toolDeactivateV2Obj && deactivateV2Done) {
      done = true;
    }
    if (!doneLocked && toolDeleteV3Obj && deleteV3Done) {
      done = true;
    }
    satisfied = Array.isArray(parsedOut?.satisfied) ? parsedOut.satisfied : [];

    return jsonResponse(req, { success: true, request_id: requestId, next_message: next, done, satisfied });
  } catch (error) {
    console.error(`[simulate-user] request_id=${requestId}`, error);
    // Rescue path: if model is transiently unavailable or we hit timeouts, try a forced stable model (2.0 flash)
    // using the last prompts we attempted (no hardcoded user message).
    const msg = error instanceof Error ? error.message : String(error);
    const lowered = msg.toLowerCase();
    const transient =
      lowered.includes("resource exhausted") ||
      lowered.includes("overloaded") ||
      lowered.includes("unavailable") ||
      lowered.includes("timeout") ||
      lowered.includes("timed out") ||
      lowered.includes("abort") ||
      lowered.includes("429") ||
      lowered.includes("503");
    if (transient && body) {
      try {
        const allowReal = Boolean(body.force_real_ai);
        const requestId2 = `${requestId}:rescue_transient`;
        // Build a minimal safe prompt if we didn't reach prompt construction.
        const transcriptText = (body.transcript as TranscriptMsg[])
          .slice(-20)
          .map((m) => `${m.role.toUpperCase()}${m.role === "assistant" && m.agent_used ? `(${m.agent_used})` : ""}: ${m.content}`)
          .join("\n");
        const fallbackSystem = `
Tu joues le rôle d'un UTILISATEUR HUMAIN qui parle avec l'assistant Sophia.
Contraintes:
- 1 seul message utilisateur.
- français, 1ère personne.
- pas de consignes au coach, pas de A/B.
Sortie JSON uniquement: {"next_message":"...","done":true/false,"satisfied":[]}
        `.trim();
        const fallbackUser = `
TURN ${body.turn_index + 1}/${body.max_turns}
TRANSCRIPT:
${transcriptText || "(vide)"}
        `.trim();

        const sys = lastSystemPrompt || fallbackSystem;
        const usr = lastUserMessage || fallbackUser;
        const out = await generateWithGemini(sys, usr, 0.2, true, [], "auto", {
          requestId: requestId2,
          model: "gemini-2.0-flash",
          source: "simulate-user:rescue_transient",
          forceRealAi: allowReal,
          evalRunId: (body as any)?.eval_run_id ?? null,
          maxRetries: 2,
          httpTimeoutMs: 8_000,
        } as any);
        const parsedOut = JSON.parse(out as string);
        const next = String(parsedOut?.next_message ?? "").trim();
        const check = looksAssistantish(next);
        if (!next || check.bad) {
          return jsonResponse(req, { error: "simulate-user rescue failed", detail: msg, request_id: requestId }, { status: 503 });
        }
        const done = Boolean(parsedOut?.done) || body.turn_index + 1 >= body.max_turns;
        const satisfied = Array.isArray(parsedOut?.satisfied) ? parsedOut.satisfied : [];
        return jsonResponse(req, { success: true, request_id: requestId, next_message: next, done, satisfied });
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        return jsonResponse(req, { error: "simulate-user failed: model unavailable", detail: `${msg} | rescue=${msg2}`, request_id: requestId }, { status: 503 });
      }
    }
    return serverError(req, requestId);
  }
});


