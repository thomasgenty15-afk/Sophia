
/**
 * LA RELANCE, DANS LA VOIX DU COACH — le module pur.
 *
 * ── LA JUSTIFICATION QUI EST TOMBÉE ──────────────────────────────────────────
 * L'en-tête de `renderReengageNudge` explique en huit lignes pourquoi la
 * relance n'est PAS composée: elle part après 72 h de silence, donc toujours
 * hors de la fenêtre de 24 h de Meta, donc `whatsapp-send` la délivre
 * obligatoirement en TEMPLATE, et un template est un texte figé approuvé chez
 * Meta qu'aucune composition ne peut changer. Le raisonnement était juste, et
 * il concluait: « composer ici serait du code mort déguisé en fonctionnalité ».
 *
 * Meta est parti (chantier de-whatsapp). La fenêtre de 24 h n'existe plus, le
 * template non plus, et `sendReengageNudge` écrit maintenant une ligne dans
 * `chat_messages`. **L'obstacle qui justifiait le texte figé a disparu, et
 * l'écart assumé — « ce message n'est pas dans la voix du coach » — est devenu
 * un écart sans raison.** C'est ce que ce module referme.
 *
 * C'est aussi une leçon de méthode, et elle vaut au-delà d'ici: une contrainte
 * externe qu'on documente honnêtement devient, six semaines plus tard, une
 * décision de conception que plus personne ne rouvre. Le commentaire qui
 * l'explique si bien est exactement ce qui la fait survivre à sa cause.
 *
 * ── CE QUE CE MODULE NE FAIT PAS ─────────────────────────────────────────────
 * Il ne parle pas à la base, ni au modèle. Il construit un prompt et il JUGE un
 * texte. La règle du dépôt (`delivery_policy.ts` en est l'archétype): une règle
 * produit doit être lisible et testable sans son environnement — ici c'est
 * doublement vrai, parce que ce qui doit être éprouvé est précisément ce qui ne
 * doit JAMAIS partir, et qu'on ne peut pas se fier à un modèle pour produire à
 * la demande le texte fautif qu'on veut refuser.
 *
 * ── LA LANGUE: ON NE CONTOURNE PAS LE VERROU DU PILOTE ───────────────────────
 * Le bloc de doctrine porte déjà `write in <language>` quand le coach a réglé sa
 * voix. Il serait donc tentant de laisser la relance sortir en français pendant
 * que toute la conversation sort en anglais. C'est refusé: `locale.ts` dit que
 * le pilote force `en-US` et qu'il est LE point de changement unique. Une
 * relance dans une autre langue que la conversation qu'elle relance serait une
 * incohérence de plus, pas une correction. L'appelant ajoute donc le bloc
 * RESPONSE_LANGUAGE en dernier, comme les autres lanes; le jour où le verrou du
 * pilote saute, cette relance suivra sans qu'on touche à ce fichier.
 */

import {
  findGuiltTripping,
  type JobReachableTone,
  toneInstruction,
} from "./reengagement.ts";

/**
 * Une relance est COURTE. Ce n'est pas une préférence de style: c'est un
 * message non sollicité envoyé à quelqu'un qui s'est éloigné, et sa longueur
 * est la première chose qu'il voit. Deux phrases se lisent; un paragraphe se
 * remet à plus tard, et « plus tard » est le silence qu'on essaie de rompre.
 */
export const REENGAGE_MAX_CHARS = 240;
export const REENGAGE_MAX_SENTENCES = 3;

/**
 * NOMMER LA DURÉE DU SILENCE — la ceinture que `findGuiltTripping` n'a pas.
 *
 * Elle en a une pour le français (`ça fait 5 jours que tu n'...`), et AUCUNE
 * pour l'anglais, alors que tout ce que le pilote produit est anglais. C'est la
 * cicatrice « une garde testée dans une seule langue » du dépôt, dans l'autre
 * sens: la garde existait dans la langue qu'on n'envoie plus.
 *
 * Ce que ça attrape n'est pas un reproche — « it's been a few days! » est
 * chaleureux — mais ça compte les jours d'absence de quelqu'un à voix haute, et
 * `toneInstruction('gentle')` l'interdit explicitement depuis le premier jour:
 * « Do not mention how many days it has been. » L'instruction existait; rien ne
 * la vérifiait.
 *
 * ── CONDITION DE DÉSARMEMENT (doctrine P9) ──────────────────────────────────
 * Elle ne mord QUE sur une durée rapportée à l'ABSENCE ou à la dernière
 * conversation. « How did the last few days go? » doit passer: c'est une
 * question sur la vie de l'élève, pas un décompte de son silence. Les motifs
 * exigent donc un mot d'absence ou d'échange dans le voisinage, jamais une
 * durée seule.
 */
const SILENCE_DURATION_PATTERNS: readonly RegExp[] = [
  // "it's been 3 days", "it has been a week" — la formule de décompte.
  /\bit'?s?\s+(?:has\s+)?been\s+(?:a|an|\d+|two|three|four|five|six|seven|a\s+few|several)\s*(?:days?|weeks?|while)\b/i,
  // "in the last 5 days", "for the past two weeks" adossé à une absence.
  /\b(?:haven'?t|have\s+not|not)\s+\w{0,12}\s*(?:heard|spoken|talked|seen|caught\s+up)\b/i,
  /\b(?:since\s+(?:we|you)\s+(?:last\s+)?(?:spoke|talked|wrote|chatted|checked))\b/i,
  // "a few days without", "two weeks of silence"
  /\b(?:\d+|a\s+few|several|a|an|two|three)\s*(?:days?|weeks?)\s+(?:without|of\s+(?:silence|quiet))\b/i,
  // FR — la conversation peut sortir en français le jour où le verrou saute.
  /(?:^|[^\p{L}])(?:ç|c)a\s+fait\s+(?:\d+|quelques|deux|trois)\s*(?:jours?|semaines?)/iu,
  /\bdepuis\s+(?:notre|ta|la)\s+derni[èe]re?\s+(?:conversation|message|fois)/i,
];

/**
 * Ce qu'un message de conversation ne doit jamais porter: nos artefacts.
 *
 * EXPORTÉ parce que `daily_recap.ts` juge un second texte composé et que ces
 * motifs ne dépendent pas de la relance: du markdown reste du markdown. Deux
 * listes auraient divergé à la première addition — c'est R7, et ce dépôt a déjà
 * payé une normalisation écrite deux fois.
 */
export const PROMPT_ARTEFACT_PATTERNS: readonly RegExp[] = [
  /\*\*/,
  /^#{1,6}\s/m,
  /\[[^\]]*\]\([^)]*\)/,
  /\{\{\s*\d+\s*\}\}/,
];

export type ReengageVerdictReason =
  | "empty"
  | "too_long"
  | "too_many_sentences"
  | "guilt_tripping"
  | "names_the_silence"
  | "prompt_artefact";

export type ReengageVerdict =
  | { ok: true; text: string }
  | { ok: false; reason: ReengageVerdictReason; detail: string };

/**
 * Le prompt système. Le bloc de doctrine y entre TEL QUEL — c'est lui qui porte
 * la voix, l'adresse, la longueur et les convictions du coach.
 *
 * Ce que l'appelant NE donne PAS au modèle, et c'est délibéré: aucune donnée de
 * suivi, aucun compte de repas, aucune date. Le dépôt a déjà payé un récapitulatif
 * qui confabulait son propre narratif (`tracking-projection-not-grounded-db`).
 * Un message dont le seul fait vérifiable est un prénom ne peut pas inventer de
 * chiffre — c'est une garantie structurelle, pas une instruction de plus.
 */
export function buildReengageSystemPrompt(args: {
  doctrineBlock: string;
  tone: JobReachableTone;
}): string {
  return [
    "You are Sophia, the day-to-day voice of this student's coach.",
    "",
    "You are writing the FIRST message after the student has gone quiet. They did not ask for it.",
    "",
    toneInstruction(args.tone),
    "",
    "HARD RULES — a message that breaks any of these is discarded, not fixed:",
    `- One to two sentences. Never more than ${REENGAGE_MAX_CHARS} characters.`,
    "- Never say how long it has been, and never refer to the silence itself.",
    "- Never mention logging, tracking, adherence, streaks, targets or weight.",
    "- State no fact about this student: you have none. Do not invent progress, meals or numbers.",
    "- At most one question, and it must be answerable in a few words.",
    "- Plain text only. No markdown, no quotation marks around the message, no 'Sophia:' prefix.",
    "",
    "Reply with the message itself and nothing else.",
    "",
    "── THE COACH'S METHOD (their voice is the one you write in) ──",
    args.doctrineBlock,
  ].join("\n");
}

/** Le tour « utilisateur »: le strict minimum, pour la raison ci-dessus. */
export function buildReengageUserPrompt(firstName: string): string {
  const name = String(firstName ?? "").trim();
  return name
    ? `Write the message. The student's first name is ${name}.`
    : "Write the message. You do not know the student's first name — do not invent one, and do not use a placeholder.";
}

/**
 * Retire ce qu'un modèle ajoute par réflexe, AVANT de juger.
 *
 * Nettoyer puis juger, jamais l'inverse: refuser une bonne relance parce
 * qu'elle est arrivée entre guillemets ferait retomber tout le monde sur le
 * texte figé, et le repli deviendrait le cas nominal sans que personne ne le
 * remarque — un composeur mort déguisé en composeur prudent, c'est-à-dire
 * exactement ce que ce module existe pour ne plus être.
 */
export function sanitizeComposedNudge(raw: string): string {
  let text = String(raw ?? "").trim();
  // Un préfixe de rôle, quelle que soit la casse.
  text = text.replace(/^(?:sophia|assistant|coach)\s*:\s*/i, "");
  // Des guillemets qui enveloppent TOUT le message (pas une citation interne).
  const wrapped = /^(["'“”«])([\s\S]+)(["'“”»])$/.exec(text.trim());
  if (wrapped) text = wrapped[2].trim();
  // Les espaces multiples et les retours à la ligne: une relance est un bloc.
  text = text.replace(/\s*\n+\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim();
  return text;
}

/** Exporté pour la même raison que `PROMPT_ARTEFACT_PATTERNS` — un second juge. */
export function countSentences(text: string): number {
  const parts = text.split(/[.!?…]+(?:\s|$)/).map((s) => s.trim()).filter(Boolean);
  return parts.length;
}

/**
 * La ceinture complète, sur le texte EXACT que l'élève lirait.
 *
 * Rend un verdict plutôt que de lever: l'appelant a un repli déterministe et
 * doit pouvoir le prendre en comptant le motif. Une exception l'obligerait à
 * l'attraper pour ne rien en faire, ce qui finit toujours par un `catch {}`.
 */
export function acceptComposedNudge(raw: string): ReengageVerdict {
  const text = sanitizeComposedNudge(raw);
  if (!text) return { ok: false, reason: "empty", detail: "" };

  if (text.length > REENGAGE_MAX_CHARS) {
    return {
      ok: false,
      reason: "too_long",
      detail: `${text.length} > ${REENGAGE_MAX_CHARS}`,
    };
  }

  const sentences = countSentences(text);
  if (sentences > REENGAGE_MAX_SENTENCES) {
    return {
      ok: false,
      reason: "too_many_sentences",
      detail: `${sentences} > ${REENGAGE_MAX_SENTENCES}`,
    };
  }

  for (const pattern of PROMPT_ARTEFACT_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      return { ok: false, reason: "prompt_artefact", detail: match[0] };
    }
  }

  const guilt = findGuiltTripping(text);
  if (guilt.length > 0) {
    return {
      ok: false,
      reason: "guilt_tripping",
      detail: guilt.map((f) => f.matchedText).join(" | "),
    };
  }

  for (const pattern of SILENCE_DURATION_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      return { ok: false, reason: "names_the_silence", detail: match[0].trim() };
    }
  }

  return { ok: true, text };
}
