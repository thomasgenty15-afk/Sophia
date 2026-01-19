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
  return (ts ?? []).some((m) =>
    m?.role === "user" &&
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

  // Stage map (user turns). We keep it mostly turn-index driven for stability.
  // We also allow jumping forward if the transcript clearly indicates later stages were reached.
  // Stages:
  // 0) explore creating an action (no consent)
  // 1) give duration + time of day
  // 2) give frequency + hesitation about creating now (still no consent)
  // 3) panic crisis -> should route firefighter
  // 4) cancel create flow explicitly + pivot to bilan
  // 5) trigger bilan + mention existing action "Sport"
  // 6) say missed action + short reason
  // 7) give blocker context + defer a topic "pour X, on en reparle après"
  // 8) accept micro-step breakdown
  // 9) give blocker details if asked
  // 10) accept adding the micro-step to the plan
  // 11) post-checkup: engage on deferred topic
  // 12) close the deferred topic (answer "oui/ok" when asked "C'est bon pour ce point ?")
  const desiredByTurn = (i: number): number => {
    if (i <= 0) return 0;
    if (i === 1) return 1;
    if (i === 2) return 2;
    if (i === 3) return 3;
    if (i === 4) return 4;
    if (i === 5) return 5;
    if (i === 6) return 6;
    if (i === 7) return 7;
    if (i === 8) return 8;
    if (i === 9) return 9;
    if (i === 10) return 10;
    if (i === 11) return 11;
    return 12;
  };

  const inferred = (() => {
    const lastA = [...(ts ?? [])].reverse().find((m) => m?.role === "assistant")?.content ?? "";
    const lastAL = String(lastA).toLowerCase();
    if (/c['’]est\s+bon\s+pour\s+ce\s+point\s*\?/i.test(lastA)) return 12;
    if (/\bpost-?bilan\b/i.test(lastA) || /\b(sujet\s+report[ée]|tu\s+m['’]avais\s+dit)\b/i.test(lastAL)) return 11;
    if ((ts ?? []).some((m) => m?.role === "user" && /\bajoute-la\s+au\s+plan\b/i.test(String(m?.content ?? "")))) return 10;
    if ((ts ?? []).some((m) => m?.role === "user" && /\bmicro-étape|micro[-\s]?etape\b/i.test(String(m?.content ?? "")) && /\b(oui|ok|vas[-\s]?y)\b/i.test(String(m?.content ?? "")))) return 8;
    if ((ts ?? []).some((m) => m?.role === "user" && /\b(pas\s+fait|rat[ée]|j['’]ai\s+pas\s+fait)\b/i.test(String(m?.content ?? "")))) return 6;
    if (hasAssistantMode(ts, "investigator")) return 5;
    if ((ts ?? []).some((m) => m?.role === "user" && /\bannule|laisse\s+tomber|stop\b/i.test(String(m?.content ?? "")))) return 4;
    if (hasAssistantMode(ts, "firefighter") || looksLikePanicCrisisUser(ts)) return 3;
    return 0;
  })();

  const finalStage = 12;
  const stage = Math.min(finalStage, Math.max(inferred, desiredByTurn(Math.max(0, Number(turnIndex) || 0))));
  const forcedDone = stage >= finalStage;

  const stageInstruction = (() => {
    switch (stage) {
      case 0:
        return [
          `Tu veux créer une action mais tu n'es pas sûr(e). Contexte: ${createContext}`,
          `OBLIGATOIRE: inclure la question "tu en penses quoi ?"`,
          `IMPORTANT: NE DONNE PAS de consentement explicite ("ok vas-y") pour l'ajouter.`,
        ].join(" ");
      case 1:
        return [
          `Tu donnes des paramètres pratiques.`,
          `OBLIGATOIRE: inclure "${createDuration} minutes" et "le soir" (ou "avant de dormir").`,
          `IMPORTANT: pas de consentement explicite pour l'ajouter.`,
        ].join(" ");
      case 2:
        return [
          `Tu précises la fréquence et tu hésites.`,
          `OBLIGATOIRE: inclure exactement "${createReps} fois par semaine".`,
          `OBLIGATOIRE: inclure une hésitation du type "je sais pas si je dois la créer maintenant".`,
          `IMPORTANT: ne dis pas "ok vas-y" / "tu peux l'ajouter".`,
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
          `Puis tu dis que tu veux faire un bilan rapide pour comprendre ton blocage sur "${existingActionTitle}".`,
          `OBLIGATOIRE: mentionner "${existingActionTitle}".`,
        ].join(" ");
      case 5:
        return [
          `Tu déclenches explicitement le bilan.`,
          `OBLIGATOIRE: inclure le mot "bilan".`,
          `Tu précises que sur "${existingActionTitle}" tu bloques depuis plusieurs jours.`,
        ].join(" ");
      case 6:
        return [
          `Tu réponds à l'investigator: "${existingActionTitle}" n'a pas été fait.`,
          `OBLIGATOIRE: inclure "pas fait" (ou "raté").`,
          `OBLIGATOIRE: 1 raison courte (fatigue, procrastination, stress).`,
        ].join(" ");
      case 7:
        return [
          `Tu donnes 1-2 phrases de contexte sur le blocage.`,
          `Et tu ajoutes un sujet à traiter après: "${deferredTopic}".`,
          `OBLIGATOIRE: utiliser exactement la structure: "Pour ${deferredTopic}, on en reparle après."`,
          `IMPORTANT: reste naturel, pas de meta.`,
        ].join(" ");
      case 8:
        return [
          `Si Sophia propose une micro-étape, tu acceptes clairement.`,
          `OBLIGATOIRE: inclure "oui" ou "ok" + "vas-y" et le mot "micro-étape".`,
        ].join(" ");
      case 9:
        return [
          `Si Sophia te demande ce qui bloque concrètement, tu réponds avec un détail actionnable (1-2 phrases).`,
          `Ex: fatigue + friction de démarrage + lieu/moment.`,
        ].join(" ");
      case 10:
        return [
          `Si Sophia propose d'ajouter la micro-étape au plan, tu acceptes explicitement.`,
          `OBLIGATOIRE: inclure "oui, ajoute-la au plan".`,
        ].join(" ");
      case 11:
        return [
          `Tu entres dans le sujet différé: ${deferredTopic}.`,
          `Tu décris en 2-4 phrases ce qui se passe (concret, vécu).`,
        ].join(" ");
      case 12:
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

function isShortAck(s: string): boolean {
  const t = String(s ?? "").trim().toLowerCase();
  if (!t) return false;
  if (t.length <= 12 && /^(ok|oui|non|d['’]accord|merci|go|vas[-\s]?y|c['’]est bon|ça marche)\b/i.test(t)) return true;
  return false;
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
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
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
    default:
      if (difficulty === "easy") return { next_message: `Ok.`, done: turn >= 1, satisfied: turn >= 1 ? ["generic"] : [] };
      if (difficulty === "hard") return { next_message: `Bof.`, done: turn >= 1, satisfied: turn >= 1 ? ["generic"] : [] };
      return { next_message: `Test turn ${turn}: ok.`, done: turn >= 1, satisfied: turn >= 1 ? ["generic"] : [] };
  }
}

const BodySchema = z.object({
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

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  // Keep last parsed body accessible for the catch block (to support graceful fallback).
  let body: z.infer<typeof BodySchema> | null = null;
  try {
    if (req.method === "OPTIONS") return handleCorsOptions(req);
    const corsErr = enforceCors(req);
    if (corsErr) return corsErr;
    if (req.method !== "POST") return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });

    const parsed = await parseJsonBody(req, BodySchema, requestId);
    if (!parsed.ok) return parsed.response;
    body = parsed.data;

    const authHeader = req.headers.get("Authorization") ?? "";
    const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
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

    const toolCreateActionObj = findObjective(body.objectives ?? [], "tools_create_action_realistic");
    const toolUpdateActionObj = findObjective(body.objectives ?? [], "tools_update_action_realistic");
    const toolBreakDownActionObj = findObjective(body.objectives ?? [], "tools_break_down_action_realistic");
    const toolActivateActionObj = findObjective(body.objectives ?? [], "tools_activate_action_realistic");
    const toolComplexObj = findObjective(body.objectives ?? [], "tools_complex_multimachine_realistic");

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
    const complexFlow = toolComplexObj
      ? buildComplexMultiMachineStateMachineContext(toolComplexObj, body.transcript as TranscriptMsg[], body.turn_index)
      : null;
    const complexDone = Boolean(complexFlow?.forcedDone);

    const toolFlow =
      (!complexDone && complexFlow)
        ? complexFlow
        : ((!createDone && createFlow)
          ? createFlow
          : ((!updateDone && updateFlow)
            ? updateFlow
            : ((!breakDownDone && breakDownFlow)
              ? breakDownFlow
              : ((!activateDone && activateFlow) ? activateFlow : null))));

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

    const MAX_ROLE_RETRIES = 3;
    let parsedOut: any = null;
    let next = "";
    let satisfied: any[] = [];
    let done = false;
    let lastInvalidReason = "";
    // Keep last prompts for a "rescue" attempt in case we hit transient provider issues.
    let lastSystemPrompt = "";
    let lastUserMessage = "";
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

      const systemPrompt = `${baseSystemPrompt}${stageStrict}${stageStrictBreakdown}`.trim();
      const userMessage = baseUserMessage;
      lastSystemPrompt = systemPrompt;
      lastUserMessage = userMessage;

      const out = await generateWithGemini(systemPrompt, userMessage, attempt >= 2 ? 0.2 : 0.4, true, [], "auto", {
        requestId: `${requestId}:role_retry:${attempt}`,
        // IMPORTANT: start from 2.5 (stable) and let gemini.ts fallback to 2.0 on timeouts/503/empty responses.
        model: (body as any).model ?? "gemini-2.5-flash",
        source: "simulate-user",
        forceRealAi: allowReal,
        // Keep retries short to avoid edge-runtime early termination; gemini.ts has an internal fallback chain.
        maxRetries: 3,
        httpTimeoutMs: 8_000,
      } as any);
      try {
      parsedOut = JSON.parse(out as string);
      } catch {
        lastInvalidReason = "invalid_json";
        continue;
      }
      next = String(parsedOut?.next_message ?? "").trim();
      if (!next) continue;
      // No "assistant-ish" hard gate here; judge will evaluate style at the end.
      // BUT: keep the update_action state machine mechanically valid so the scenario can reach the assertions.
      if (toolUpdateActionObj && updateFlow && !updateDone) {
        const v = validateUpdateActionStageMessage(updateFlow.stage, next, updateFlow.meta);
        if (!v.ok) {
          lastInvalidReason = v.reason;
          next = "";
          continue;
        }
      }
      if (toolBreakDownActionObj && breakDownFlow && !breakDownDone) {
        const v = validateBreakDownActionStageMessage(breakDownFlow.stage, next, breakDownFlow.meta);
        if (!v.ok) {
          lastInvalidReason = v.reason;
          next = "";
          continue;
        }
      }
      if (toolActivateActionObj && activateFlow && !activateDone) {
        const v = validateActivateActionStageMessage(activateFlow.stage, next, activateFlow.meta);
        if (!v.ok) {
          lastInvalidReason = v.reason;
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
    if (!next) return jsonResponse(req, { error: "Empty next_message", request_id: requestId }, { status: 500 });
    done = Boolean(parsedOut?.done) || body.turn_index + 1 >= body.max_turns;
    // Tool state machines: prevent early stop until ALL requested flows complete.
    if (toolFlow) {
      const allDone =
        (toolComplexObj ? complexDone : true) &&
        (toolCreateActionObj ? createDone : true) &&
        (toolUpdateActionObj ? updateDone : true) &&
        (toolBreakDownActionObj ? breakDownDone : true) &&
        (toolActivateActionObj ? activateDone : true);
      done = allDone || body.turn_index + 1 >= body.max_turns;
    }
    // IMPORTANT: once a tool flow is complete, stop the scenario immediately to avoid extra turns
    // that can trigger unrelated routing issues (librarian/architect/firefighter) after a checkup ends.
    if (toolBreakDownActionObj && breakDownDone) {
      done = true;
    }
    if (toolActivateActionObj && activateDone) {
      // Once activated, stop immediately and avoid any follow-up that can trigger routing/tool loops.
      next = `Ok, merci.`;
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


