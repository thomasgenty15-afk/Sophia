/**
 * LOT E — LE COÛT RÉEL DU CATALOGUE D'INGRÉDIENTS, EN CARACTÈRES.
 *
 * Le lot C l'estime à « ≈ +6 900 caractères sur ~35 800, soit +19 % ». Ce
 * script le MESURE: il charge le référentiel local (celui qui porte déjà la
 * migration de validation du lot A), construit le bloc exactement comme le
 * handler, et le met en face des six consignes archivées de l'enquête.
 *
 * ⛔ AUCUN APPEL MODÈLE, AUCUNE ÉCRITURE. Lecture seule.
 *
 *   deno run --allow-read scratchpad/2026-09-11-CHANTIER-PREMIER-JET/lotE-01-catalog-cost.ts
 */
import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
import { isComposable } from "../../supabase/functions/_shared/keel/food_reference_manifest.ts";
import {
  buildCompositionCatalog,
  CATALOG_TOTAL_CAP,
} from "../../supabase/functions/_shared/keel/composition_contract.ts";

const HERE = new URL(".", import.meta.url);
const refs = JSON.parse(await Deno.readTextFile(new URL("lotE-refs.json", HERE)));
const aliases = JSON.parse(await Deno.readTextFile(new URL("lotE-aliases.json", HERE)));

// Un client de lecture qui rend les lignes déjà exportées: `loadCompositionIndex`
// reste le SEUL chargeur, donc la règle de validation et les faux amis sont
// exactement ceux de la production.
const db = {
  from(table: string) {
    const rows = table === "food_composition_refs"
      ? refs
      : table === "food_composition_aliases"
      ? aliases
      : [];
    return {
      select(_columns: string) {
        return {
          range(from: number, to: number) {
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
          },
        };
      },
    };
  },
};

for (const lang of ["fr", "en"] as const) {
  const index = await loadCompositionIndex(db, { lang });
  const catalog = buildCompositionCatalog({
    index,
    isComposable,
    excludedGroups: [],
    forbidden: [],
    totalCap: CATALOG_TOTAL_CAP,
  });
  // Le handler colle `lines.join("\n")` plus deux sauts de ligne.
  const servi = catalog.lines.join("\n").length + 2;
  console.log(JSON.stringify({ lang, servi, ...catalog.counters }, null, 2));

  // Les six consignes archivées: leur `prompt_chars` est la longueur du MESSAGE
  // UTILISATEUR réellement envoyé (métadonnées de `llm_raw_response_events`).
  const consignes = JSON.parse(
    await Deno.readTextFile(
      new URL("../2026-09-11-ENQUETE-DEUX-DIRECTIONS/consignes.json", HERE),
    ),
  ) as { step: number; kind: string; metadata: Record<string, number> }[];
  if (lang === "fr") {
    for (const c of consignes) {
      const before = c.metadata.prompt_chars;
      const after = before + servi;
      console.log(
        `  ${String(c.step).padStart(2)} ${c.kind.padEnd(45)} ` +
          `${before} → ${after}  (+${servi}, +${(servi / before * 100).toFixed(1)} %)`,
      );
    }
    const sys = consignes[0].metadata.system_prompt_chars;
    const total = consignes[0].metadata.prompt_chars + sys;
    console.log(
      `  système ${sys} + utilisateur ${consignes[0].metadata.prompt_chars} = ${total} ` +
        `→ ${total + servi}  (+${(servi / total * 100).toFixed(1)} % sur le prompt ENTIER)`,
    );
  }
}
