/**
 * FF-021 · PHASE E — LE REPLI DÉTERMINISTE ET SA LANGUE.
 *
 * Soumis DIRECTEMENT à la fonction, comme FF-029 l'a fait pour `minor_quantity`:
 * c'est la seule manière de mesurer une garde de texte sans se faire renverser
 * par `PILOT_FORCED_LOCALE` (T-2/T-19).
 */
import {
  disorderedEatingDeterministicMessage,
  validateVisibleMessage,
} from "../supabase/functions/sophia-brain/skills/disordered_eating_guard/visible_agent.ts";
import { FORBIDDEN_METRIC_TERMS } from "../supabase/functions/_shared/keel/nutrition_lexicon.ts";

const KINDS = [
  "open_without_numbers",
  "numbers_refusal",
  "clinical_resources",
  "medical_escalation",
  "respect_decline_hold",
  "holding",
  "close",
] as const;

console.log("=== E1 · LE REPLI DÉTERMINISTE, LES 7 GABARITS ===");
console.log(
  `signature: disorderedEatingDeterministicMessage(kind, resourceLines) — arité ${disorderedEatingDeterministicMessage.length}, AUCUN paramètre de locale\n`,
);
let french = 0;
for (const kind of KINDS) {
  const msg = disorderedEatingDeterministicMessage(kind, ["Beat helpline: 0808 801 0677"]);
  // Un marqueur français quelconque suffit à établir qu'un gabarit FR existe.
  const looksFrench =
    /\b(je|tu|ton|ta|tes|votre|paus[ée]|chiffres|coach est|pas une sanction)\b/i
      .test(msg) && !/\bI'|I’|your coach is the person\b/i.test(msg);
  if (looksFrench) french++;
  console.log(
    `[${looksFrench ? "FR" : "EN"}] ${kind.padEnd(22)} :: ${msg.slice(0, 96).replace(/\n/g, " ")}`,
  );
}
console.log(
  `\n--- E1 verdict: ${french}/7 gabarits en français. ${
    french === 0
      ? "REPLI MONOLINGUE ANGLAIS — miroir exact de T-19 (le repli de crise est monolingue FRANÇAIS)."
      : "bilingue"
  }`,
);

console.log("\n=== E2 · LE VALIDATEUR EST-IL BILINGUE ? ===");
console.log(`FORBIDDEN_METRIC_TERMS: ${FORBIDDEN_METRIC_TERMS.length} termes`);
const task = {
  kind: "holding" as const,
  conversation_context: {
    max_questions: 0,
    clinical_resources: { resolution: { resources: [], fallbackUsed: false } },
  },
  // deno-lint-ignore no-explicit-any
} as any;

const CASES: Array<{ text: string; expectOk: boolean; note: string }> = [
  { text: "I'm here with you.", expectOk: true, note: "EN neutre" },
  { text: "Je suis là avec toi.", expectOk: true, note: "FR neutre" },
  { text: "Your adherence is paused.", expectOk: false, note: "EN adherence" },
  { text: "Ton assiduité est en pause.", expectOk: false, note: "FR assiduité" },
  { text: "Ton poids reste en pause.", expectOk: false, note: "FR poids" },
  { text: "Tes kilos ne sont pas le sujet.", expectOk: false, note: "FR kilos" },
  { text: "Ton IMC n'est pas le sujet.", expectOk: false, note: "FR IMC" },
  { text: "Ta série est en pause.", expectOk: false, note: "FR série (streak)" },
  { text: "Your streak is paused.", expectOk: false, note: "EN streak" },
  { text: "Ton score est en pause.", expectOk: false, note: "FR score" },
  { text: "Tu as perdu 3 kg.", expectOk: false, note: "FR chiffre + unité" },
  { text: "You lost 3 kg.", expectOk: false, note: "EN chiffre + unité" },
  { text: "Environ deux cents calories.", expectOk: false, note: "FR calories en lettres" },
  { text: "About two hundred calories.", expectOk: false, note: "EN calories en lettres" },
];
let g = 0, r = 0;
for (const c of CASES) {
  const v = validateVisibleMessage(c.text, task);
  const ok = v.ok === c.expectOk;
  if (ok) g++;
  else r++;
  console.log(
    `${ok ? "[GREEN]" : "[RED]  "} ${c.note.padEnd(26)} attendu=${
      c.expectOk ? "PASSE" : "REJET"
    } obtenu=${v.ok ? "PASSE" : `REJET(${v.reason})`} :: "${c.text}"`,
  );
}
console.log(`\n--- E2 verdict: GREEN=${g} RED=${r} / ${CASES.length}`);
