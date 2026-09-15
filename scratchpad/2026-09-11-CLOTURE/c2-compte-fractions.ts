// ═══════════════════════════════════════════════════════════════════════════
// ⟳ C2 (2026-09-12) — COMBIEN DE LIGNES PORTENT ENCORE UNE FRACTION
// ═══════════════════════════════════════════════════════════════════════════
//
// La mesure de l'étape, avant et après. Elle lit les plans FIGÉS par C0
// (`c0-tir{1..6}.json`, `c0-apresmidi.json`) et les deux plans relus de
// `fixtures/plans.json`, et compte par unité les `amount` non entiers.
//
// ⛔ AUCUNE ÉCRITURE. Les fixtures ne bougent pas: l'arrondi s'applique à une
// COPIE en mémoire quand on passe `--apres`.
// ⚠️ IMPORT DYNAMIQUE, pour que la mesure « AVANT » tourne sur l'arbre
// d'avant le correctif — c'est la moitié de la mesure.
const moduleRendu = "../../supabase/functions/_shared/keel/quantity_render.ts";

interface Ligne {
  term?: string;
  quantity?: string | null;
  amount?: number | null;
  unit?: string | null;
}

function lignesDuPlan(
  plan: Record<string, unknown>,
): { source: string; ligne: Ligne }[] {
  const out: { source: string; ligne: Ligne }[] = [];
  for (const p of (plan.preparations ?? []) as Record<string, unknown>[]) {
    for (const l of (p.ingredients ?? []) as Ligne[]) {
      out.push({ source: `prep:${String(p.id ?? "?")}`, ligne: l });
    }
  }
  for (const d of (plan.dishes ?? []) as Record<string, unknown>[]) {
    for (const l of (d.ingredients ?? []) as Ligne[]) {
      out.push({ source: `dish:${String(d.day ?? "?")}/${String(d.slot ?? "?")}`, ligne: l });
    }
  }
  return out;
}

const apres = Deno.args.includes("--apres");
// deno-lint-ignore no-explicit-any
const rendu: any = apres ? await import(moduleRendu) : null;

// ⚠️ LE POIDS D'UNE PIÈCE, GELÉ DEPUIS LE RÉFÉRENTIEL LOCAL. Ce banc n'a pas
// d'index de composition (il lit des lignes JSON relues, pas un `meal` en
// mémoire) : il rejoue donc la résolution minimale — `ref` exact, puis alias du
// terme. ⛔ CE N'EST PAS LE RÉSOLVEUR DE PRODUCTION : le moteur appelle
// `resolveCompositionLine`, et c'est LUI qui est branché. Ce raccourci ne sert
// qu'à compter, et il ne peut que SOUS-estimer (un terme non résolu rend
// `null`, donc une ligne de plus « rendue à la réparation »).
const REFERENTIEL = JSON.parse(
  await Deno.readTextFile(new URL("./fixtures/c2-unit-grams.json", import.meta.url)),
) as { unit_grams: Record<string, number>; alias: Record<string, string> };

function poidsDUnePiece(l: { term?: string; ref?: string | null }): number | null {
  const slug = typeof l.ref === "string" && l.ref !== "" ? l.ref : null;
  if (slug !== null) return REFERENTIEL.unit_grams[slug] ?? null;
  const t = String(l.term ?? "").trim().toLowerCase();
  const viaAlias = REFERENTIEL.alias[t];
  if (viaAlias) return REFERENTIEL.unit_grams[viaAlias] ?? null;
  return REFERENTIEL.unit_grams[t] ?? null;
}

const sources: { nom: string; plan: Record<string, unknown> }[] = [];
for (const tir of ["1", "2", "3", "4", "5", "6"]) {
  const f = JSON.parse(
    await Deno.readTextFile(
      new URL(`./fixtures/c0-tir${tir}.json`, import.meta.url),
    ),
  );
  if (f.ligne_ecrite) sources.push({ nom: `tir${tir}`, plan: f.ligne_ecrite });
}
{
  const f = JSON.parse(
    await Deno.readTextFile(new URL("./fixtures/c0-apresmidi.json", import.meta.url)),
  );
  if (f.ligne_ecrite) sources.push({ nom: "apresmidi", plan: f.ligne_ecrite });
}
{
  const f = JSON.parse(
    await Deno.readTextFile(
      new URL("../2026-09-11-FIABILITE-RECETTES/fixtures/plans.json", import.meta.url),
    ),
  );
  for (const [i, p] of (f.plans as Record<string, unknown>[]).entries()) {
    sources.push({ nom: `plan${i}:${String(p.id ?? "").slice(0, 8)}`, plan: p });
  }
}

let totalLignes = 0;
let totalFrac = 0;
const parUnite = new Map<string, { lignes: number; frac: number }>();
const exemples: string[] = [];

for (const { nom, plan } of sources) {
  const copie = JSON.parse(JSON.stringify(plan)) as Record<string, unknown>;
  if (apres) {
    const counts = rendu.finalizePlanQuantities(
      rendu.planQuantityLines(
        (copie.dishes ?? []) as { ingredients?: never[] }[],
        (copie.preparations ?? []) as { ingredients?: never[] }[],
      ),
      String(copie.content_locale ?? "").slice(0, 2).toLowerCase() === "fr" ? "fr" : "en",
      poidsDUnePiece,
    );
    console.log(`  ${nom} · arrondi ${JSON.stringify(counts.rounding)}`);
    for (const z of counts.zeroed) {
      console.log(`  ${nom} · ⚠️ RENDU À LA RÉPARATION : ${z.term} ${z.amount} ${z.unit}`);
    }
  }
  let frac = 0;
  let lignes = 0;
  for (const { source, ligne } of lignesDuPlan(copie)) {
    const a = ligne.amount;
    const u = String(ligne.unit ?? "");
    if (typeof a !== "number" || !Number.isFinite(a) || a <= 0 || u === "") continue;
    lignes++;
    const e = parUnite.get(u) ?? { lignes: 0, frac: 0 };
    e.lignes++;
    if (!Number.isInteger(a)) {
      frac++;
      e.frac++;
      if (exemples.length < 25) {
        exemples.push(`${nom} · ${source} · ${ligne.term} · ${a} ${u} · « ${ligne.quantity} »`);
      }
    }
    parUnite.set(u, e);
  }
  totalLignes += lignes;
  totalFrac += frac;
  console.log(`${nom.padEnd(22)} lignes ${String(lignes).padStart(4)} · fractionnaires ${String(frac).padStart(4)}`);
}

console.log("─".repeat(70));
console.log(`TOTAL ${apres ? "APRÈS" : "AVANT"} : ${totalFrac} lignes fractionnaires sur ${totalLignes} lignes quantifiées`);
for (const [u, e] of [...parUnite].sort()) {
  console.log(`  ${u.padEnd(6)} ${String(e.frac).padStart(4)} / ${String(e.lignes).padStart(4)}`);
}
console.log("─".repeat(70));
for (const x of exemples) console.log("  " + x);
