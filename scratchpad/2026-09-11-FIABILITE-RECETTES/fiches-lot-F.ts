/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT F ⑥ — LES FICHES DE RECETTE, AVANT ET APRÈS, À MÊME TAILLE DE PORTION
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/fiches-lot-F.ts \
 *     <sortie.json> [--tout]
 *
 * Le plan : « fournir les fiches avant/après **ramenées à une même taille de
 * portion** pour comparer les PROPORTIONS, puis les fiches RÉELLEMENT proposées
 * à la personne. »
 *
 * ⛔ « AVANT » EST LA RÉPONSE BRUTE DU MODÈLE, « APRÈS » EST CE QUI EST EN BASE.
 * Ramener les deux à 100 g de total retire la question de la TAILLE et ne laisse
 * que celle des RAPPORTS : c'est la seule comparaison qui puisse dire si une
 * sauce a été déséquilibrée.
 *
 * ⛔ ET CE FICHIER NE GOÛTE RIEN. Il imprime des grammes et des rapports.
 * « L'agent fournit les fiches et la grille ; il ne prétend ni avoir cuisiné ni
 * avoir prouvé la saveur avec un score modèle. » La faisabilité (méthode,
 * hydratation, équipement, assemblage) se lit sur les fiches SERVIES, qui sont
 * imprimées en entier dessous.
 */
const chemin = Deno.args[0];
if (!chemin) {
  console.error("usage : fiches-lot-F.ts <sortie.json> [--tout]");
  Deno.exit(2);
}
const TOUT = Deno.args.includes("--tout");
const sortie = JSON.parse(await Deno.readTextFile(chemin)) as Record<string, unknown>;
const ligne = sortie.ligne_ecrite as Record<string, unknown>;
if (!ligne) {
  console.error("⛔ aucune ligne écrite dans cette sortie.");
  Deno.exit(1);
}
const brute = String(sortie.reponse_brute ?? "");
let modele: Record<string, unknown> | null = null;
try {
  modele = brute ? JSON.parse(brute) as Record<string, unknown> : null;
} catch {
  modele = null;
}

type Ligne = { term: string; amount: number | null; unit: string | null; quantity: string | null };

function lignesDe(o: Record<string, unknown>): Ligne[] {
  const arr = Array.isArray(o.ingredients) ? o.ingredients as Record<string, unknown>[] : [];
  return arr.map((i) => ({
    term: String(i.term ?? ""),
    amount: typeof i.amount === "number" ? i.amount : null,
    unit: typeof i.unit === "string" ? i.unit : null,
    quantity: i.quantity === null || i.quantity === undefined ? null : String(i.quantity),
  }));
}

/**
 * Les rapports, ramenés à 100 unités de total.
 *
 * ⛔ ON NE MÉLANGE PAS LES UNITÉS. Une ligne en cuillères et une ligne en
 * grammes ne s'additionnent pas ; le total est donc celui des lignes d'une
 * MÊME unité, et les autres sortent à part. Sommer « 60 g + 2 tbsp » donnerait
 * un dénominateur inventé.
 */
function proportions(lignes: readonly Ligne[]): {
  parUnite: Map<string, { total: number; parts: { term: string; part: number; brut: number }[] }>;
  sansNombre: string[];
} {
  const parUnite = new Map<
    string,
    { total: number; parts: { term: string; part: number; brut: number }[] }
  >();
  const sansNombre: string[] = [];
  for (const l of lignes) {
    if (l.amount === null || !l.unit) {
      sansNombre.push(l.term);
      continue;
    }
    const e = parUnite.get(l.unit) ?? { total: 0, parts: [] };
    e.total += l.amount;
    e.parts.push({ term: l.term, part: 0, brut: l.amount });
    parUnite.set(l.unit, e);
  }
  for (const e of parUnite.values()) {
    for (const p of e.parts) p.part = e.total > 0 ? (p.brut / e.total) * 100 : 0;
  }
  return { parUnite, sansNombre };
}

function cle(o: Record<string, unknown>): string {
  return `${String(o.day ?? "")}/${String(o.slot ?? "")}`;
}

function fiche(titre: string, lignes: readonly Ligne[]): string {
  const { parUnite, sansNombre } = proportions(lignes);
  const out: string[] = [`   ${titre}`];
  for (const [unite, e] of parUnite) {
    out.push(`     total ${e.total.toFixed(2)} ${unite}`);
    for (const p of e.parts.sort((a, b) => b.part - a.part)) {
      out.push(
        `       ${p.part.toFixed(1).padStart(5)} %   ${
          p.brut.toFixed(2).padStart(8)
        } ${unite}   ${p.term}`,
      );
    }
  }
  if (sansNombre.length > 0) {
    out.push(`     sans nombre (condiments) : ${sansNombre.join(", ")}`);
  }
  return out.join("\n");
}

console.log(`══════════════════════════════════════════════════════════════════`);
console.log(`FICHES DE RECETTE — plan ${String(ligne.id)}`);
console.log(`══════════════════════════════════════════════════════════════════`);
if (!modele) {
  console.log(
    `⚠️ AUCUNE RÉPONSE BRUTE DANS CETTE SORTIE : la colonne « AVANT » ne peut` +
      ` pas être imprimée, et le rapport doit le dire plutôt que comparer un` +
      ` plan à lui-même.`,
  );
}

const platsFinaux = (ligne.dishes ?? []) as Record<string, unknown>[];
const platsModele = (modele?.dishes ?? []) as Record<string, unknown>[];
const prepsFinales = (ligne.preparations ?? []) as Record<string, unknown>[];
const prepsModele = (modele?.preparations ?? []) as Record<string, unknown>[];

// ── LES PRÉPARATIONS : c'est là que vivent sauces, liants et appareils ────
console.log(`\n── PRÉPARATIONS ─────────────────────────────────────────────`);
for (const p of prepsFinales) {
  const id = String(p.id ?? "");
  const av = prepsModele.find((x) => String(x.id ?? "") === id);
  console.log(`\n· ${id} — « ${String(p.title ?? p.name ?? "")} »`);
  if (av) console.log(fiche("AVANT (réponse du modèle, ramenée à 100 %)", lignesDe(av)));
  console.log(fiche("APRÈS (en base, ramenée à 100 %)", lignesDe(p)));
  if (av) {
    const a = proportions(lignesDe(av));
    const b = proportions(lignesDe(p));
    const ecarts: string[] = [];
    for (const [unite, ea] of a.parUnite) {
      const eb = b.parUnite.get(unite);
      if (!eb) continue;
      for (const pa of ea.parts) {
        const pb = eb.parts.find((x) => x.term === pa.term);
        if (!pb) continue;
        const d = pb.part - pa.part;
        if (Math.abs(d) >= 0.05) {
          ecarts.push(
            `       ${pa.term} : ${pa.part.toFixed(1)} % → ${pb.part.toFixed(1)} % ` +
              `(${d >= 0 ? "+" : ""}${d.toFixed(1)} pt)`,
          );
        }
      }
    }
    console.log(
      ecarts.length === 0
        ? `     ✅ RAPPORTS INCHANGÉS — la recette n'a été que mise à l'échelle.`
        : `     ⚠️ RAPPORTS DÉPLACÉS :\n${ecarts.join("\n")}`,
    );
  }
  if (TOUT) console.log(`     méthode : ${String(p.method ?? "")}`);
}

// ── LES PLATS : le frais assemblé dans l'assiette ─────────────────────────
console.log(`\n── PLATS (frais assemblé) ───────────────────────────────────`);
for (const d of platsFinaux) {
  const k = cle(d);
  const av = platsModele.find((x) => cle(x) === k);
  console.log(`\n· ${k} — « ${String(d.title ?? d.name ?? "")} »`);
  if (av) console.log(fiche("AVANT (modèle)", lignesDe(av)));
  console.log(fiche("APRÈS (en base)", lignesDe(d)));
  console.log(
    `     composants culinaires déclarés : ${
      Array.isArray(d.components) ? (d.components as unknown[]).length : 0
    }`,
  );
}

// ── LA FICHE RÉELLEMENT PROPOSÉE ─────────────────────────────────────────
console.log(`\n══ CE QUE LA PERSONNE LIT (fiches servies) ═══════════════════`);
for (const p of prepsFinales) {
  console.log(`\n· ${String(p.title ?? p.name ?? p.id)}`);
  console.log(`  pour ${String(p.servings_made ?? "?")} part(s) · ${
    String(p.total_minutes ?? "?")
  } min en tout, dont ${String(p.active_minutes ?? "?")} min de mains`);
  for (const l of lignesDe(p)) console.log(`  · ${l.quantity ?? "—"}`);
  console.log(`  méthode : ${String(p.method ?? "")}`);
}
for (const d of platsFinaux) {
  console.log(`\n· ${cle(d)} — ${String(d.title ?? d.name ?? "")}`);
  for (const l of lignesDe(d)) console.log(`  · ${l.quantity ?? "—"}`);
  console.log(`  méthode : ${String(d.method ?? "")}`);
}
console.log(
  `\n⛔ AUCUNE DE CES RECETTES N'A ÉTÉ CUISINÉE NI GOÛTÉE. Ce fichier imprime ` +
    `des grammes et des rapports ; la faisabilité se LIT, la saveur se GOÛTE, ` +
    `et la dégustation reste à faire par un humain.`,
);
