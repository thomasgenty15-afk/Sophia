/**
 * L1 — niveau EXTRA: LA COPIE FRANÇAISE RÉVEILLÉE, sur les surfaces visibles
 * atteignables depuis le chat.
 *
 * Chaque scénario est rejoué 3 fois (le dispatcher est stochastique) sur un
 * élève NEUF (aucune ancre, aucun historique). On cherche le texte MIXTE.
 */
import {
  anchoredLocale,
  languageOf,
  lastTrace,
  provision,
  turn,
  type Coach,
  type Student,
} from "./l1_lib.ts";

const results: any[] = [];
let coach: Coach | undefined;
let seats = 0;

async function freshStudent(label: string, locale: string, country: string) {
  if (!coach || seats >= 3) {
    coach = undefined;
    seats = 0;
  }
  const p = await provision({ country, locale, coach, label });
  coach = p.coach;
  seats++;
  return p.student;
}

async function scenario(
  label: string,
  locale: string,
  country: string,
  messages: string[],
) {
  for (let i = 0; i < 3; i++) {
    const student = await freshStudent(`${label}${i}`, locale, country);
    for (const message of messages) {
      const t = await turn(student, message);
      const tr = await lastTrace(student.userId);
      const lang = languageOf(t.reply);
      const row = {
        label: `${label}#${i + 1}`,
        locale,
        message,
        owner: tr?.response_owner,
        effects: (tr?.direct_effects ?? []).map((e: any) =>
          e?.type ?? e?.effect_type ?? e?.effect
        ),
        anchor: await anchoredLocale(student.userId),
        lang: lang.verdict,
        fr_hits: lang.fr_hits,
        en_hits: lang.en_hits,
        reply: t.reply,
      };
      results.push(row);
      console.log(
        `\n[${row.label}] owner=${row.owner} lang=${row.lang}(fr${row.fr_hits}/en${row.en_hits}) effects=${JSON.stringify(row.effects)}`,
      );
      console.log(`  > ${message}`);
      console.log(`  < ${JSON.stringify(t.reply)}`);
    }
  }
}

// E · substitution sur une ligne du plan → skills/plan_question/renderer.ts
await scenario("E-planq-FR", "fr-FR", "FR", [
  "est-ce que je peux remplacer le poulet par du tofu au déjeuner ?",
]);

// F · déclaration d'allergie → always_on/declare_safety_constraint/renderer.ts
await scenario("F-allergie-FR", "fr-FR", "FR", [
  "je suis allergique aux arachides",
]);

// G · fait déclaré → always_on/log_protocol_event/renderer.ts (accusé rendu
//     bilingue par ce lot) — deux items pour éprouver la conjonction.
await scenario("G-repas-FR", "fr-FR", "FR", [
  "j'ai pris mes protéines et mes légumes au déjeuner aujourd'hui",
]);

// H · écart planifié à l'avance → always_on/declare_deviation/renderer.ts
await scenario("H-ecart-FR", "fr-FR", "FR", [
  "samedi je suis à un mariage toute la journée, je ne suivrai pas le plan",
]);

await Deno.writeTextFile(
  new URL("./l1_awakened_results.json", import.meta.url),
  JSON.stringify(results, null, 2),
);
console.log("\n--- résumé ---");
for (const r of results) {
  console.log(
    `${r.label}\towner=${r.owner}\tlang=${r.lang}(fr${r.fr_hits}/en${r.en_hits})\teffects=${JSON.stringify(r.effects)}`,
  );
}
