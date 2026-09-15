/**
 * C6 — POURQUOI « champignons de Paris » EST DÉCLARÉ NON ACHETÉ ALORS QU'IL EST
 * SUR LA LISTE, ÉCRIT À L'IDENTIQUE. Sonde de lecture seule.
 */
import { loadCompositionIndex } from "../../../supabase/functions/_shared/keel/food_composition_io.ts";
import { resolveCompositionLine } from "../../../supabase/functions/_shared/keel/food_composition.ts";
import { loadDotEnv } from "../../2026-09-11-FIABILITE-RECETTES/transport-lot-F.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ROOT = decodeURIComponent(new URL("../../../", import.meta.url).pathname);
const env = loadDotEnv(`${ROOT}supabase/.env`);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const index = await loadCompositionIndex(db as never, { lang: "fr" });

const cas = [
  { etiquette: "ligne de PRÉPARATION (ref écrit)", term: "champignons de Paris", ref: "button_mushroom_cultivated_mushroom" },
  { etiquette: "ligne de COURSES (aucun ref)", term: "champignons de Paris", ref: null },
  { etiquette: "singulier", term: "champignon de Paris", ref: null },
  { etiquette: "nu", term: "champignons", ref: null },
];
for (const c of cas) {
  const r = resolveCompositionLine(index, { term: c.term, ref: c.ref });
  console.log(
    `${c.etiquette.padEnd(36)} « ${c.term} » ref=${c.ref ?? "—"} → ` +
      `${r.ref?.slug ?? "AUCUN"} (source ${r.source ?? "—"}, refus ${r.refusal ?? "—"})`,
  );
}
