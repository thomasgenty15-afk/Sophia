// S1e (fiche neuve) — la ligature dans la lane MÉMOIRE. Mesuré, pas supposé.
import { extractRedactionTerms } from "../supabase/functions/_shared/memory/correction/redaction.ts";

const stamp = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
console.log(`== MESURE · lane mémoire · ${stamp} CEST ==`);

function sonde(txt: string) {
  return extractRedactionTerms({
    id: "x",
    content_text: txt,
    normalized_summary: null,
    scope: "global",
    pending_changes_count: 0,
    metadata: {},
  } as never);
}

for (
  const paire of [
    ["ma soeur a rechute", "ma sœur a rechute"],
    ["je culpabilise a cause de ma soeur", "je culpabilise a cause de ma sœur"],
  ]
) {
  const [dig, lig] = paire;
  const a = sonde(dig), b = sonde(lig);
  const sensibleA = a.some((w) => /soeur/.test(w));
  const sensibleB = b.some((w) => /soeur|sœur/.test(w));
  console.log(`  ${JSON.stringify(dig)}\n    termes=${JSON.stringify(a)} sensible=${sensibleA}`);
  console.log(`  ${JSON.stringify(lig)}\n    termes=${JSON.stringify(b)} sensible=${sensibleB}`);
  console.log(`    ${JSON.stringify(a) === JSON.stringify(b) ? "ACCORD" : "*** DIVERGE ***"}`);
}
