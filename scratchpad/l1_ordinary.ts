/**
 * L1 — niveaux MEDIUM/EXTRA: les tours ORDINAIRES (hors crise).
 *
 * C'est ici que se mesure le vrai risque du lot: toute la copie française
 * runtime était morte au rendu, et le désarmement la remet en service d'un
 * coup. On échantillonne les surfaces les plus fréquentes, en FR et en EN, et
 * on cherche le texte MIXTE — celui qui n'existait pas tant que tout sortait
 * en anglais.
 */
import {
  anchoredLocale,
  languageOf,
  lastTrace,
  provision,
  setAnchor,
  turn,
  type Coach,
  type Student,
} from "./l1_lib.ts";

const results: any[] = [];

async function say(student: Student, label: string, message: string) {
  const t = await turn(student, message);
  const tr = await lastTrace(student.userId);
  const anchor = await anchoredLocale(student.userId);
  const lang = languageOf(t.reply);
  const row = {
    label,
    message,
    http: t.status,
    owner: tr?.response_owner,
    effects: (tr?.direct_effects ?? []).map((e: any) => e?.type ?? e?.effect_type),
    anchor,
    lang: lang.verdict,
    fr_hits: lang.fr_hits,
    en_hits: lang.en_hits,
    reply: t.reply,
    user_id: student.userId,
  };
  results.push(row);
  console.log(
    `\n--- ${label}  owner=${row.owner} lang=${row.lang}(fr${row.fr_hits}/en${row.en_hits}) anchor=${anchor}`,
  );
  console.log(`    > ${message}`);
  console.log(`    < ${JSON.stringify(t.reply)}`);
  return row;
}

// ── A · élève fr-FR: quatre surfaces ordinaires ────────────────────────────
{
  const { coach, student } = await provision({
    country: "FR",
    locale: "fr-FR",
    label: "ordFR",
  });
  await say(student, "A1-FR-chat", "salut, comment on fait pour bien manger le midi ?");
  await say(student, "A2-FR-repas", "j'ai mangé du poulet et des légumes ce midi");
  await say(student, "A3-FR-question-plan", "est-ce que je peux remplacer le poulet par du tofu ?");
  await say(student, "A4-FR-hors-plan", "hier soir j'ai mangé une pizza, c'était pas prévu");

  // ── B · élève en-US, MÊME coach: le contrôle ────────────────────────────
  const { student: us } = await provision({
    country: "US",
    locale: "en-US",
    coach,
    label: "ordUS",
  });
  await say(us, "B1-EN-chat", "hey, how should I handle lunch today?");
  await say(us, "B2-EN-repas", "I had chicken and vegetables for lunch");
  await say(us, "B3-EN-question-plan", "can I swap the chicken for tofu?");

  // ── C · L'ANCRE EMPOISONNÉE PAR L'ÉPINGLE ───────────────────────────────
  // 253 lignes `user_chat_states` portent `conversation_locale='en-US'` écrit
  // par l'épingle elle-même, dont 191 pour des élèves `fr-FR`. `persisted`
  // prime sur `studentProfile` (R3): sans purge, l'épingle continue de régner
  // depuis les DONNÉES après avoir été retirée du CODE.
  const { student: poisoned } = await provision({
    country: "FR",
    locale: "fr-FR",
    coach,
    label: "ancre",
  });
  await say(poisoned, "C0-ancre-tour-de-chauffe", "salut !");
  await setAnchor(poisoned.userId, "en-US");
  console.log(`\n[C] ancre forcée à en-US: ${await anchoredLocale(poisoned.userId)}`);
  await say(poisoned, "C1-ancre-empoisonnee", "et pour ce soir, je fais quoi ?");
  await setAnchor(poisoned.userId, null);
  console.log(`\n[C] ancre purgée: ${await anchoredLocale(poisoned.userId)}`);
  await say(poisoned, "C2-ancre-purgee", "et pour ce soir, je fais quoi ?");
}

await Deno.writeTextFile(
  new URL("./l1_ordinary_results.json", import.meta.url),
  JSON.stringify(results, null, 2),
);
console.log("\n--- résumé ---");
for (const r of results) {
  console.log(
    `${r.label}\towner=${r.owner}\tlang=${r.lang}(fr${r.fr_hits}/en${r.en_hits})\tanchor=${r.anchor}\teffects=${JSON.stringify(r.effects)}`,
  );
}
