// A2 — LA FAIM DEVIENT-ELLE UN TRAIT DURABLE ? (R4 l'interdit)
// On interroge le pré-filtre du memorizer sur les phrases de FF-027.
import { classifyAntiNoise } from "../supabase/functions/_shared/memory/memorizer/batch_selector.ts";
const PHRASES = [
  "j'ai eu trop faim ces derniers jours",
  "I've been too hungry these last few days",
  "j'ai faim tous les soirs",
  "I'm hungry every evening",
  "je crève la dalle tous les soirs en ce moment et ça devient vraiment difficile à tenir sur la durée",
];
for (const content of PHRASES) {
  const r = classifyAntiNoise({ role: "user", content } as never, []);
  console.log(`${r.skip ? "SKIP" : "PASSE"} (${r.reason ?? "-"}) · ${content}`);
}
