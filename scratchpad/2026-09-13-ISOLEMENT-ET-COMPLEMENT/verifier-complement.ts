/**
 * ══════════════════════════════════════════════════════════════════════════
 * §2.2 — LE COMPLÉMENT, ADDITIONNÉ AVEC LES LECTEURS DE PRODUCTION
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read --allow-env --allow-net \
 *     scratchpad/2026-09-13-ISOLEMENT-ET-COMPLEMENT/verifier-complement.ts <plan-id>
 *
 * ⛔ « UN DRAPEAU `complementsShared` PRÉSENT DANS LA SOURCE NE PROUVE RIEN. »
 * Ce fichier n'en lit aucun pour conclure : il additionne les GRAMMES et les
 * KILOCALORIES des contenants réellement écrits, par `boxNutrition`
 * (`mouth_energy.ts`), le lecteur de la mesure finale du produit.
 *
 * ⛔ LES DEUX ÉGALITÉS DU PLAN, ET RIEN D'AUTRE :
 *     énergie servie à la personne = part commune + complément
 *     quantité prélevée du lot commun = somme des parts communes servies
 */
import { indexDuReferentiel } from "../2026-09-13-CIBLES-PAR-PERSONNE/composer-reference.ts";
import { boxNutrition } from "../../supabase/functions/_shared/keel/mouth_energy.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const env = Object.fromEntries(
  (await Deno.readTextFile(`${ROOT}supabase/.env`)).split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const API = env.SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const PLAN = Deno.args.find((a) => !a.startsWith("--"));
if (!PLAN) {
  console.error("usage : verifier-complement.ts <plan-id>");
  Deno.exit(2);
}
const res = await fetch(
  `${API}/rest/v1/student_generated_meals?id=eq.${PLAN}&select=*`,
  { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
);
const ligne = (await res.json() as Record<string, unknown>[])[0];
if (!ligne) {
  console.error(`⛔ aucun plan ${PLAN} en base.`);
  Deno.exit(2);
}

type Item = { grams?: number | null; preparation_id?: string | null };
type Box = {
  id?: string;
  member_ids?: string[];
  items?: Item[];
  total_grams?: number | null;
};
type Plat = {
  title?: string;
  day?: string;
  slot?: string;
  method?: string;
  member_id?: string | null;
  complements_shared?: boolean;
  ingredients?: Record<string, unknown>[];
  uses?: { preparation_id?: string; servings?: number }[];
  boxes?: Box[];
};
type Pot = {
  id: string;
  servings_made?: number;
  ingredients?: Record<string, unknown>[];
};

const dishes = (ligne.dishes ?? []) as Plat[];
const pots = (ligne.preparations ?? []) as Pot[];
const index = await indexDuReferentiel();

const mesures = boxNutrition({
  index,
  dishes: dishes.map((d) => ({
    day: d.day ?? null,
    slot: d.slot ?? null,
    method: d.method ?? "",
    ingredients: (d.ingredients ?? []) as never,
    uses: (d.uses ?? []).map((u) => ({
      preparationId: String(u.preparation_id ?? ""),
      servings: Number(u.servings ?? 1),
    })),
    boxes: (d.boxes ?? []).map((b) => ({
      id: String(b.id ?? ""),
      memberIds: (b.member_ids ?? []).map(String),
      items: (b.items ?? []).map((i) => ({
        grams: Number(i.grams ?? 0),
        preparationId: i.preparation_id ?? null,
      })),
      legacyTotalGrams: b.total_grams === undefined || b.total_grams === null
        ? null
        : Number(b.total_grams),
    })),
  })) as never,
  preparations: pots.map((p) => ({
    id: p.id,
    servingsMade: Number(p.servings_made ?? 1),
    ingredients: (p.ingredients ?? []) as never,
  })) as never,
});

// ── ① CHAQUE CASE, PAR PERSONNE : COMBIEN DE CONTENANTS, ET QUE PORTENT-ILS ─
console.log(`── ① LES CONTENANTS ÉCRITS, MESURÉS PAR \`boxNutrition\` ───────`);
type Ligne = {
  membre: string;
  jour: string;
  slot: string;
  plat: string;
  complement: boolean;
  grammes: number;
  kcal: number | null;
};
const lignes: Ligne[] = [];
for (const [i, d] of dishes.entries()) {
  for (const b of d.boxes ?? []) {
    const m = mesures.find((x) => x.boxId === String(b.id ?? "") &&
      x.day === (d.day ?? null) && x.slot === (d.slot ?? null) &&
      x.memberIds.join(",") === (b.member_ids ?? []).join(",")
    );
    for (const membre of b.member_ids ?? []) {
      lignes.push({
        membre,
        jour: String(d.day ?? ""),
        slot: String(d.slot ?? ""),
        plat: String(d.title ?? `#${i}`),
        complement: d.complements_shared === true,
        grammes: m?.grams ?? 0,
        kcal: m?.kcal ?? null,
      });
    }
  }
}
const cles = [...new Set(lignes.map((l) => `${l.membre}|${l.jour}|${l.slot}`))].sort();
let ecarts = 0;
for (const cle of cles) {
  const [membre, jour, slot] = cle.split("|");
  const mes = lignes.filter((l) =>
    l.membre === membre && l.jour === jour && l.slot === slot
  );
  if (mes.length < 2) continue;
  const commune = mes.filter((l) => !l.complement);
  const extra = mes.filter((l) => l.complement);
  if (extra.length === 0) continue;
  const kCom = commune.reduce((n, l) => n + (l.kcal ?? 0), 0);
  const kExt = extra.reduce((n, l) => n + (l.kcal ?? 0), 0);
  const gCom = commune.reduce((n, l) => n + l.grammes, 0);
  const gExt = extra.reduce((n, l) => n + l.grammes, 0);
  console.log(
    `\n   ${membre.slice(0, 8)} ${jour}/${slot} — ${mes.length} contenant(s)`,
  );
  for (const l of mes) {
    console.log(
      `      ${(l.complement ? "COMPLÉMENT" : "part commune").padEnd(13)} ` +
        `${l.grammes.toFixed(0).padStart(4)} g · ` +
        `${l.kcal === null ? "illisible" : l.kcal.toFixed(1).padStart(7) + " kcal"} ` +
        `« ${l.plat.slice(0, 40)} »`,
    );
  }
  console.log(
    `      ── ÉGALITÉ ① : part commune ${kCom.toFixed(1)} kcal + complément ` +
      `${kExt.toFixed(1)} kcal = ${(kCom + kExt).toFixed(1)} kcal servies · ` +
      `assiette ${(gCom + gExt).toFixed(0)} g`,
  );
}

// ── ② LE PRÉLÈVEMENT DU LOT COMMUN, CONTRE LA SOMME DES PARTS SERVIES ──────
console.log(`\n── ② PRÉLÈVEMENT DU LOT COMMUN ───────────────────────────────`);
for (const p of pots) {
  // Ce que les contenants disent avoir pris de ce lot.
  let prisParLesBoites = 0;
  for (const d of dishes) {
    for (const b of d.boxes ?? []) {
      for (const it of b.items ?? []) {
        if (String(it.preparation_id ?? "") !== p.id) continue;
        const g = Number(it.grams);
        if (Number.isFinite(g) && g > 0) prisParLesBoites += g;
      }
    }
  }
  // Ce que le lot PRODUIT : ses ingrédients, une seule fois.
  const produit = (p.ingredients ?? []).reduce((n, l) => {
    const g = Number((l as { amount?: number }).amount);
    return Number.isFinite(g) && g > 0 ? n + g : n;
  }, 0);
  const parts = Number(p.servings_made ?? 0);
  const tires = dishes.flatMap((d) => d.uses ?? [])
    .filter((u) => String(u.preparation_id ?? "") === p.id)
    .reduce((n, u) => n + Number(u.servings ?? 1), 0);
  console.log(
    `   ${p.id.padEnd(24)} produit ${produit.toFixed(0).padStart(6)} g cru · ` +
      `${parts} part(s) pour ${tires} prélèvement(s) · ` +
      `somme des parts SERVIES ${prisParLesBoites.toFixed(0).padStart(6)} g`,
  );
  if (prisParLesBoites > produit + 0.5) {
    ecarts++;
    console.log(
      `   ⛔ LES CONTENANTS PRENNENT PLUS QUE LE LOT NE PRODUIT ` +
        `(${prisParLesBoites.toFixed(0)} > ${produit.toFixed(0)}) — ` +
        `le stock serait soustrait deux fois.`,
    );
  }
}

console.log(
  `\n${ecarts === 0 ? "✅ AUCUN DOUBLE COMPTE" : `⛔ ${ecarts} ÉCART(S)`} sur le plan écrit.`,
);
if (ecarts > 0) Deno.exit(1);
