// Pack français — le namespace `substance`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `substance.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frSubstance = {
  // ── Les substances ───────────────────────────────────────────────────────
  // Nomenclature internationale: une bonne part s'écrit à l'identique, et
  // inventer une différence serait pire qu'un mot recopié.
  "substance.vitamin_d3": "vitamine D3",
  "substance.omega3_epa_dha": "oméga-3 (EPA+DHA)",
  "substance.magnesium_glycinate": "glycinate de magnésium",
  "substance.iron_bisglycinate": "bisglycinate de fer",
  "substance.creatine_monohydrate": "créatine monohydrate",
  "substance.vitamin_k2": "vitamine K2",
  "substance.methylfolate": "méthylfolate",
  "substance.zinc": "zinc",
  "substance.copper": "cuivre",
  "substance.curcumin": "curcumine",
  "substance.piperine": "pipérine",
  "substance.alcohol": "alcool",
  "substance.caffeine": "caféine",
  "substance.gluten": "gluten",
  "substance.st_johns_wort": "millepertuis",
  "substance.melatonin": "mélatonine",
  "substance.ashwagandha": "ashwagandha",
  "substance.berberine": "berbérine",
  "substance.vitamin_c": "vitamine C",
  "substance.vitamin_a": "vitamine A",
  "substance.vitamin_e": "vitamine E",
  "substance.vitamin_b12": "vitamine B12",
  "substance.niacin": "niacine",
  "substance.selenium": "sélénium",
  "substance.iodine": "iode",
  "substance.calcium_citrate": "citrate de calcium",
  "substance.potassium": "potassium",
  "substance.omega3_epa": "oméga-3 EPA",
  "substance.omega3_dha": "oméga-3 DHA",
  "substance.collagen": "collagène",
  "substance.whey_protein": "protéine de lactosérum",
  "substance.casein": "caséine",
  "substance.fiber_psyllium": "fibres de psyllium",
  "substance.probiotic": "probiotique",
  "substance.coq10": "CoQ10",
  "substance.nac": "NAC",
  "substance.glycine": "glycine",
  "substance.taurine": "taurine",
  "substance.electrolytes": "électrolytes",
  "substance.sodium_chloride": "sel",
} satisfies TranslatedMessagesOf<"substance">;
