/**
 * SONDE — CE QUE L'INJECTION FAIT À LEA, ET CE QUE LE FORK LUI REND
 *
 *   deno run --allow-read --allow-env --allow-net \
 *     scratchpad/2026-09-13-ISOLEMENT-ET-COMPLEMENT/sonder-lea.ts
 *
 * ⛔ ELLE NE DÉCIDE RIEN. Elle appelle les MÊMES lecteurs de production que la
 * référence (`dishEnergy`, `weighedReadyGrams`, `proteinOfUnit`,
 * `foldPreparationsIntoDishes`) pour dimensionner une injection et un fork
 * AVANT de dépenser un tir de banc. Le verdict, lui, vient du moteur.
 */
import {
  indexDuReferentiel,
  ligne,
  type Ligne,
  mesurer,
} from "../2026-09-13-CIBLES-PAR-PERSONNE/composer-reference.ts";
import { foldPreparationsIntoDishes } from "../../supabase/functions/_shared/keel/meal_verdict.ts";
import { contratsDeLaDemande } from "../2026-09-13-CIBLES-PAR-PERSONNE/mesurer-reference.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const index = await indexDuReferentiel();
const CONTRATS = Deno.args.find((a) => a.startsWith("--contrats="))?.slice(11) ??
  "scratchpad/2026-09-13-ISOLEMENT-ET-COMPLEMENT/lot-iso1-contrats.json";
const contrats = await contratsDeLaDemande(`${ROOT}${CONTRATS}`);
const lea = contrats.find((c) => c.prenom === "Lea")!;

const POT_COMMUN: Ligne[] = [
  ligne("tofu", "tofu", 2700),
  ligne("graines de courge", "pumpkin_seeds", 682),
  ligne("courgette", "courgette", 180),
  ligne("huile d'olive", "olive_oil", 12),
  ligne("sauce soja", "soy_sauce", 75),
];
const METHODE_LOT = "Couper le tofu en cubes, le faire dorer à l'huile d'olive.";
const METHODE_PLAT = "Réchauffer sa portion du lot de tofu doré.";

/** L'énergie et la protéine d'une case, à la cible de la bouche. */
function servi(plat: { method: string; ingredients: Ligne[] }, cible: number) {
  const m = mesurer(index, plat);
  if (m.kcal === null || m.densite === null) return null;
  return {
    densite: m.densite,
    grammes: (cible / m.densite) * 100,
    proteine: (m.proteineG ?? 0) * (cible / m.kcal),
  };
}

function plierDejeuner(o: {
  fresh: Ligne[];
  pot: Ligne[];
  parts: number;
}): { method: string; ingredients: Ligne[] } {
  const [plie] = foldPreparationsIntoDishes({
    dishes: [{
      slot: "lunch",
      method: METHODE_PLAT,
      ingredients: o.fresh as never,
      uses: [{ preparationId: "p", servings: 1 }],
    }],
    preparations: [{
      id: "p",
      servingsMade: o.parts,
      ingredients: o.pot as never,
    }],
  });
  return { method: METHODE_PLAT, ingredients: plie.ingredients as never };
}

const caseDe = (jour: string, slot: string) =>
  lea.cases.find((x) => x.jour === jour && x.slot === slot)!;
const DEJ = caseDe("mon", "lunch");
const PDJ = caseDe("mon", "breakfast");
const DIN = caseDe("mon", "dinner");

const pdj = servi({
  method: "Mélanger le yaourt de soja, l'avoine et les graines de courge.",
  ingredients: [
    ligne("yaourt de soja", "soy_yogurt", 260),
    ligne("avoine", "oats", 18),
    ligne("graines de courge", "pumpkin_seeds", 26),
    ligne("edamame", "edamame", 170),
  ],
}, PDJ.cible!)!;
const din = servi({
  method: "Faire sauter le tofu et les edamame dans sa propre poêle.",
  ingredients: [
    ligne("tofu", "tofu", 200),
    ligne("edamame", "edamame", 110),
    ligne("épinards", "spinach", 80),
    ligne("graines de courge", "pumpkin_seeds", 12),
    ligne("huile d'olive", "olive_oil", 5),
  ],
}, DIN.cible!)!;

const FRAIS_BASE: Ligne[] = [
  ligne("graines de courge", "pumpkin_seeds", Number(
    Deno.args.find((a) => a.startsWith("--graines="))?.slice(10) ?? "45",
  )),
];

function bilan(nom: string, dej: ReturnType<typeof servi>) {
  if (dej === null) {
    console.log(`${nom.padEnd(38)} illisible`);
    return;
  }
  const jour = pdj.proteine + dej.proteine + din.proteine;
  const masseOk = dej.grammes >= (DEJ.gMin ?? 0) && dej.grammes <= (DEJ.gMax ?? 0);
  const rhoOk = dej.densite >= (DEJ.rMin ?? 0) && dej.densite <= (DEJ.rMax ?? Infinity);
  console.log(
    `${nom.padEnd(38)} ρ=${dej.densite.toFixed(1).padStart(6)} ` +
      `[${(DEJ.rMin ?? 0).toFixed(0)}–${(DEJ.rMax ?? 0).toFixed(0)}] ${rhoOk ? "✅" : "❌"}  ` +
      `${dej.grammes.toFixed(0).padStart(4)} g [${DEJ.gMin}–${DEJ.gMax}] ${masseOk ? "✅" : "❌"}  ` +
      `déjeuner ${dej.proteine.toFixed(1).padStart(5)} g · JOUR ${jour.toFixed(1)} g ` +
      `(plancher ${lea.plancherProteineG}) ${
        jour >= (lea.plancherProteineG ?? 0) ? "✅" : "❌ SOUS LE PLANCHER"
      }`,
  );
}

console.log(
  `Lea · cible déjeuner ${DEJ.cible} kcal · petit-déj ${pdj.proteine.toFixed(1)} g · ` +
    `dîner ${din.proteine.toFixed(1)} g`,
);
bilan("référence (aucune injection)", servi(plierDejeuner({ fresh: FRAIS_BASE, pot: POT_COMMUN, parts: 6 }), DEJ.cible!));
for (const g of [0, 20, 30, 38, 45, 60]) {
  bilan(
    `+ ${g} g d'huile dans SON plat`,
    servi(
      plierDejeuner({
        fresh: [...FRAIS_BASE, ligne("huile d'olive", "olive_oil", g)],
        pot: POT_COMMUN,
        parts: 6,
      }),
      DEJ.cible!,
    ),
  );
}
console.log("\n── LE FORK : deux parts, tofu relevé, graines abaissées ────────");
const HUILE = Number(Deno.args.find((a) => a.startsWith("--huile="))?.slice(8) ?? "38");
for (const [tofu, graines] of [[900, 227], [1100, 120], [1300, 60], [1500, 30], [1700, 15], [2000, 10]]) {
  bilan(
    `fork tofu ${tofu} · graines ${graines}`,
    servi(
      plierDejeuner({
        fresh: HUILE > 0 ? [...FRAIS_BASE, ligne("huile d'olive", "olive_oil", HUILE)] : [...FRAIS_BASE],
        pot: [
          ligne("tofu", "tofu", tofu),
          ligne("graines de courge", "pumpkin_seeds", graines),
          ligne("courgette", "courgette", 60),
          ligne("huile d'olive", "olive_oil", 4),
          ligne("sauce soja", "soy_sauce", 25),
        ],
        parts: 2,
      }),
      DEJ.cible!,
    ),
  );
}
