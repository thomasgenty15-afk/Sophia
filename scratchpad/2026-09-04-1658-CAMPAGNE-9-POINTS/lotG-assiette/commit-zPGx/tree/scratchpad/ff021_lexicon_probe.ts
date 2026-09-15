/**
 * FF-021 — sonde DÉTERMINISTE du lexique compensatoire (T9: les deux langues).
 * Pure fonction, aucune base: on soumet le texte au plancher lui-même.
 */
import { evaluateRestrictionGuard } from "../supabase/functions/_shared/keel/restriction_guard.ts";

function trips(text: string, locale: string): string[] {
  const r = evaluateRestrictionGuard({
    as_of_local_date: "2026-08-08",
    weekly_outcomes: [],
    energy_days: [],
    texts: [{ source: "turn_message", text, content_locale: locale }],
  });
  const t = r.triggers.find((x) => x.code === "compensatory_language");
  return (t?.evidence?.matched_tokens as string[] | undefined) ?? [];
}

const CASES: Array<{ text: string; locale: string; expect: boolean; note: string }> = [
  // ── EN, doivent mordre ──
  { text: "I skipped dinner", locale: "en-US", expect: true, note: "EN skip_meal" },
  { text: "I'll skip breakfast tomorrow", locale: "en-US", expect: true, note: "EN skip futur" },
  { text: "I threw up after dinner", locale: "en-US", expect: true, note: "EN purge" },
  { text: "I didn't deserve dinner", locale: "en-US", expect: true, note: "EN deserve" },
  { text: "I have to earn my food first", locale: "en-US", expect: true, note: "EN earn" },
  { text: "I'll fast to compensate", locale: "en-US", expect: true, note: "EN fast_to_compensate" },
  { text: "I need to make up for last night", locale: "en-US", expect: true, note: "EN make_up_for" },
  { text: "I'll burn off that dinner", locale: "en-US", expect: true, note: "EN burn_off" },
  { text: "I want to compensate for the calories", locale: "en-US", expect: true, note: "EN compensate" },
  // ── FR, doivent mordre ──
  { text: "j'ai sauté le dîner", locale: "fr-FR", expect: true, note: "FR skip passé composé" },
  { text: "je vais sauter le déjeuner", locale: "fr-FR", expect: true, note: "FR skip infinitif" },
  { text: "je saute le petit déjeuner", locale: "fr-FR", expect: true, note: "FR skip présent" },
  { text: "je me suis fait vomir", locale: "fr-FR", expect: true, note: "FR vomir" },
  { text: "je vais jeûner pour compenser", locale: "fr-FR", expect: true, note: "FR jeuner pour compenser" },
  { text: "je dois rattraper le repas d'hier", locale: "fr-FR", expect: true, note: "FR rattraper" },
  { text: "je vais compenser cet écart", locale: "fr-FR", expect: true, note: "FR compenser ecart" },
  { text: "je veux brûler ce repas", locale: "fr-FR", expect: true, note: "FR bruler" },
  { text: "je ne mérite pas de manger", locale: "fr-FR", expect: true, note: "FR merite pas" },
  { text: "je vais ne rien manger de la journée", locale: "fr-FR", expect: true, note: "FR infinitif (le motif écrit)" },
  // ── LE POINT DUR: le PASSÉ français du même fait ──
  { text: "je n'ai rien mangé de la journée", locale: "fr-FR", expect: true, note: "FR ⚠️ passé composé de 'ne rien manger'" },
  { text: "j'ai rien mangé aujourd'hui", locale: "fr-FR", expect: true, note: "FR ⚠️ passé familier" },
  { text: "je n'ai pas mangé aujourd'hui", locale: "fr-FR", expect: true, note: "FR ⚠️ négation simple au passé" },
  // ── EN, équivalent au passé ──
  { text: "I haven't eaten all day", locale: "en-US", expect: true, note: "EN ⚠️ passé de 'eat nothing all day'" },
  { text: "I didn't eat anything today", locale: "en-US", expect: true, note: "EN ⚠️ passé négatif" },
  // ── Faux amis: ne doivent PAS mordre ──
  { text: "can we skip the intro", locale: "en-US", expect: false, note: "EN faux ami skip" },
  { text: "I burned 400 kcal on the bike", locale: "en-US", expect: false, note: "EN faux ami burn" },
  { text: "please purge my inbox", locale: "en-US", expect: false, note: "EN faux ami purge" },
  { text: "on a sauté l'introduction du livre", locale: "fr-FR", expect: false, note: "FR faux ami sauter" },
  { text: "j'ai mangé un bon dîner", locale: "fr-FR", expect: false, note: "FR neutre" },
];

let green = 0;
let red = 0;
for (const c of CASES) {
  const tokens = trips(c.text, c.locale);
  const got = tokens.length > 0;
  const ok = got === c.expect;
  if (ok) green++;
  else red++;
  console.log(
    `${ok ? "[GREEN]" : "[RED]  "} ${c.note.padEnd(46)} | attendu=${
      c.expect ? "MORD" : "muet"
    } obtenu=${got ? "MORD" : "muet"} tokens=[${tokens.join(",")}] :: "${c.text}"`,
  );
}
console.log(`\n--- lexique: GREEN=${green} RED=${red} / ${CASES.length}`);
