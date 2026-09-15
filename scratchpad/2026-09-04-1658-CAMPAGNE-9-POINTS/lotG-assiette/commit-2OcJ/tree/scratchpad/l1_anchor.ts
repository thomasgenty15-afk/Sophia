/**
 * L1 — niveau HARD: L'ANCRE ÉCRITE PAR L'ÉPINGLE SURVIT-ELLE À L'ÉPINGLE ?
 *
 * `resolveResponseLocale` ancre son résultat sur le fil à chaque tour. Pendant
 * tout le pilote, ce résultat était `en-US` — donc l'épingle a écrit `en-US`
 * dans `temp_memory.conversation_locale` de CHAQUE fil actif (253 lignes en
 * base locale, dont 191 pour des élèves `fr-FR`). Comme `persisted` prime sur
 * `studentProfile` (R3, anti-oscillation), retirer la constante du CODE ne
 * suffit pas: elle continue de régner depuis les DONNÉES.
 *
 * Ce script le prouve sur une ligne qu'on contrôle, dans les deux sens.
 */
import {
  anchoredLocale,
  languageOf,
  lastTrace,
  provision,
  setAnchor,
  turn,
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
    http: t.status,
    owner: tr?.response_owner,
    anchor,
    lang: lang.verdict,
    fr_hits: lang.fr_hits,
    en_hits: lang.en_hits,
    reply: t.reply,
    user_id: student.userId,
  };
  results.push(row);
  console.log(`\n--- ${label} owner=${row.owner} lang=${row.lang} anchor=${anchor}`);
  console.log(`    < ${JSON.stringify(t.reply)}`);
  return row;
}

const { student } = await provision({
  country: "FR",
  locale: "fr-FR",
  label: "ancre",
});

// 1) Fil neuf, pas d'ancre: la chaîne lit `profiles.locale`.
await say(student, "D1-fil-neuf", "salut, qu'est-ce que je mange ce soir ?");

// 2) On repose EXACTEMENT ce que l'épingle écrivait.
await setAnchor(student.userId, "en-US");
console.log(`\n[ancre reposée à en-US] relecture=${await anchoredLocale(student.userId)}`);
await say(student, "D2-ancre-empoisonnee", "et demain midi, je fais quoi ?");
await say(student, "D3-ancre-empoisonnee-bis", "et pour le petit-déjeuner ?");

// 3) La purge — exactement ce que la commande SQL du rapport fera en prod.
await setAnchor(student.userId, null);
console.log(`\n[ancre purgée] relecture=${await anchoredLocale(student.userId)}`);
await say(student, "D4-apres-purge", "et demain midi, je fais quoi ?");
await say(student, "D5-apres-purge-bis", "et pour le petit-déjeuner ?");

await Deno.writeTextFile(
  new URL("./l1_anchor_results.json", import.meta.url),
  JSON.stringify(results, null, 2),
);
console.log("\n--- résumé ---");
for (const r of results) {
  console.log(
    `${r.label}\towner=${r.owner}\tlang=${r.lang}(fr${r.fr_hits}/en${r.en_hits})\tanchor=${r.anchor}`,
  );
}
