/**
 * ══════════════════════════════════════════════════════════════════════════
 * C0 ⑥ — LES FICHES, COMPARÉES SUR UNE BASE DE MASSE COHÉRENTE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/fiches-lot-F.ts \
 *     <scratchpad/2026-09-11-CLOTURE/fixtures/….json | sorties-lot-F/….json> [--tout]
 *
 * ⛔ CE QUE C0 A CHANGÉ, ET POURQUOI.
 *
 * La version du lot F groupait les lignes PAR UNITÉ et rendait un pourcentage
 * à l'intérieur de chaque groupe. Le plan de clôture l'interdit en toutes
 * lettres : « Un pourcentage de nombres de pièces hétérogènes ne constitue pas
 * une proportion massique ; les rapports internes seuls ne prouvent pas le
 * rapport sauce/plat. » Mesuré sur les six tirs : un groupe `unit` mélangeait
 * « 2 pitas » et « 1 oignon » dans le même dénominateur, et le pourcentage
 * rendu ne décrivait aucune masse.
 *
 * ⟳ Ici chaque ligne est convertie en GRAMMES CRUS par la fonction de
 * production `resolveIngredients` (`food_composition.ts`), une ligne à la fois.
 * Une ligne qu'on ne sait pas convertir N'ENTRE PAS dans le dénominateur et
 * elle est COMPTÉE : un pourcentage calculé sur la moitié d'une recette sans le
 * dire est exactement le défaut qu'on remplace.
 *
 * ⟳ Et quand la conversion n'est pas possible, la seconde route du plan reste
 * ouverte : « ou des facteurs par ligne ». Le tableau des facteurs
 * `après ÷ avant` sort donc systématiquement, lui n'a besoin d'aucune unité
 * commune.
 *
 * ⛔ ET CE FICHIER NE GOÛTE RIEN. Il imprime des grammes et des rapports.
 * « L'agent fournit les fiches et la grille ; il ne prétend ni avoir cuisiné ni
 * avoir prouvé la saveur avec un score modèle. »
 */
import {
  chargerFixtures,
  type Fixtures,
  troisIndex,
} from "../../scripts/2026-09-11-mesure-grille.ts";
import {
  type CompositionIndex,
  type CompositionState,
  type CompositionUnit,
  resolveIngredients,
} from "../../supabase/functions/_shared/keel/food_composition.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const FIXTURES = `${ROOT}scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures`;

const chemin = Deno.args.find((a) => !a.startsWith("--"));
if (!chemin) {
  console.error("usage : fiches-lot-F.ts <sortie.json | fixture-c0.json> [--tout]");
  Deno.exit(2);
}
const TOUT = Deno.args.includes("--tout");
const sortie = JSON.parse(await Deno.readTextFile(chemin)) as Record<string, unknown>;
const ligne = sortie.ligne_ecrite as Record<string, unknown>;
if (!ligne) {
  console.error("⛔ aucune ligne écrite dans cette sortie.");
  Deno.exit(1);
}

/**
 * LE « AVANT », ET IL EST NOMMÉ.
 *
 * ⚠️ LA LIMITE DU LOT F RESTE, ET ELLE SE DIT PLUS FORT. Le « avant » est la
 * PREMIÈRE réponse du modèle. Sur un tir qui a été RÉPARÉ, la recette finale ne
 * descend pas de cette réponse-là : la colonne « avant » n'est alors pas le
 * premier jet de la recette finale, et aucun écart de proportion ne peut être
 * imputé à l'ajusteur déterministe. Les fixtures gelées portent le nombre de
 * réparations ; on l'imprime.
 */
const etapes = (sortie.etapes ?? {}) as Record<string, unknown>;
const brute = String(etapes.premier_jet ?? sortie.reponse_brute ?? "");
const reparations = ((etapes.reparations ?? []) as unknown[]).length;
let modele: Record<string, unknown> | null = null;
try {
  modele = brute ? JSON.parse(brute) as Record<string, unknown> : null;
} catch {
  modele = null;
}

const base = await chargerFixtures(FIXTURES);
const fx: Fixtures = { ...base, plans: [ligne], contextes: [], echanges: [], journaux: [] };
const index: CompositionIndex = (await troisIndex(fx, ligne)).relecture.index;

type Ligne = {
  term: string;
  ref: string | null;
  amount: number | null;
  unit: string | null;
  state: string | null;
  quantity: string | null;
};

function lignesDe(o: Record<string, unknown>): Ligne[] {
  const arr = Array.isArray(o.ingredients) ? o.ingredients as Record<string, unknown>[] : [];
  return arr.map((i) => ({
    term: String(i.term ?? ""),
    ref: typeof i.ref === "string" && i.ref.trim() !== "" ? i.ref : null,
    // ⛔ `typeof`, PAS `Number()`. `Number(null) === 0` a déjà coûté six lignes
    // de condiment rendues à « n'en mets pas » sur ce même chantier.
    amount: typeof i.amount === "number" ? i.amount : null,
    unit: typeof i.unit === "string" ? i.unit : null,
    state: typeof i.state === "string" ? i.state : null,
    quantity: i.quantity === null || i.quantity === undefined ? null : String(i.quantity),
  }));
}

/**
 * LES GRAMMES CRUS D'UNE LIGNE — par la fonction de production, une par une.
 *
 * ⛔ `null` QUAND ON NE SAIT PAS, ET JAMAIS ZÉRO. Une pincée de sel sans
 * quantité pèse « inconnu » ; la compter zéro gonflerait la part de tout le
 * reste, et la compter au jugé inventerait une masse.
 */
function grammesDe(l: Ligne): number | null {
  const r = resolveIngredients(index, [{
    term: l.ref ?? l.term,
    amount: l.amount,
    unit: (l.unit ?? null) as CompositionUnit | null,
    state: (l.state ?? null) as CompositionState | null,
  }]);
  const g = r.resolved[0]?.gramsRaw;
  return typeof g === "number" && Number.isFinite(g) && g > 0 ? g : null;
}

interface FicheMassique {
  totalG: number;
  parts: { term: string; grammes: number; part: number }[];
  /** Les lignes hors dénominateur, avec leur motif. Jamais muettes. */
  nonConverties: { term: string; motif: string }[];
}

function ficheMassique(lignes: readonly Ligne[]): FicheMassique {
  const parts: { term: string; grammes: number; part: number }[] = [];
  const nonConverties: { term: string; motif: string }[] = [];
  let totalG = 0;
  for (const l of lignes) {
    const g = grammesDe(l);
    if (g === null) {
      nonConverties.push({
        term: l.term,
        motif: l.amount === null
          ? "aucune quantité structurée"
          : "terme ou unité non convertible en grammes",
      });
      continue;
    }
    totalG += g;
    parts.push({ term: l.term, grammes: g, part: 0 });
  }
  for (const p of parts) p.part = totalG > 0 ? (p.grammes / totalG) * 100 : 0;
  parts.sort((a, b) => b.part - a.part);
  return { totalG, parts, nonConverties };
}

function rendreFiche(titre: string, f: FicheMassique, lignes: number): string {
  const out: string[] = [
    `   ${titre}`,
    `     total ${f.totalG.toFixed(1)} g crus · ${f.parts.length} / ${lignes} ligne(s) converties`,
  ];
  for (const p of f.parts) {
    out.push(
      `       ${p.part.toFixed(1).padStart(5)} %   ${p.grammes.toFixed(1).padStart(8)} g   ${p.term}`,
    );
  }
  if (f.nonConverties.length > 0) {
    out.push(
      `     ⛔ HORS DÉNOMINATEUR (${f.nonConverties.length}) — les pourcentages ci-dessus`,
      `        ne décrivent PAS ces lignes :`,
    );
    for (const n of f.nonConverties) out.push(`        · ${n.term} — ${n.motif}`);
  }
  return out.join("\n");
}

/** Le facteur par ligne — la seconde route du plan, sans unité commune. */
function facteursParLigne(
  avant: readonly Ligne[],
  apres: readonly Ligne[],
): string[] {
  const out: string[] = [];
  for (const [i, a] of apres.entries()) {
    const b = avant[i];
    // ⛔ MÊME TERME AU MÊME RANG, sinon on compare deux aliments différents.
    if (b === undefined || b.term !== a.term) {
      out.push(`       ⚪ rang ${i} « ${a.term} » — non rapproché`);
      continue;
    }
    if (a.amount === null || b.amount === null || b.amount === 0) {
      out.push(`       ⚪ ${a.term} — facteur incalculable (quantité absente)`);
      continue;
    }
    if (a.unit !== b.unit) {
      out.push(`       ⛔ ${a.term} — UNITÉ CHANGÉE (${b.unit} → ${a.unit}) : aucun facteur`);
      continue;
    }
    out.push(
      `       ×${(a.amount / b.amount).toFixed(3)}   ${a.term}  ` +
        `(${b.amount} → ${a.amount} ${a.unit ?? ""})`,
    );
  }
  return out;
}

function cle(o: Record<string, unknown>): string {
  return `${String(o.day ?? "")}/${String(o.slot ?? "")}`;
}

console.log(`══════════════════════════════════════════════════════════════════`);
console.log(`FICHES DE RECETTE — plan ${String(ligne.id)}`);
console.log(`══════════════════════════════════════════════════════════════════`);
console.log(
  `⛔ BASE DE COMPARAISON : GRAMMES CRUS, convertis ligne à ligne par ` +
    `\`resolveIngredients\`.\n` +
    `   Un pourcentage de pièces hétérogènes n'est pas une proportion massique ; ` +
    `les lignes\n   non convertibles sortent du dénominateur ET sont nommées.`,
);
if (!modele) {
  console.log(
    `⚠️ AUCUNE RÉPONSE BRUTE DANS CETTE SORTIE : la colonne « AVANT » ne peut` +
      ` pas être imprimée, et le rapport doit le dire plutôt que comparer un` +
      ` plan à lui-même.`,
  );
} else if (reparations > 0) {
  console.log(
    `⛔ ${reparations} RÉPARATION(S) MODÈLE SUR CE TIR. La colonne « AVANT » est le` +
      ` PREMIER JET,\n   donc PAS l'ancêtre direct de la recette finale : aucun écart de` +
      ` proportion ci-dessous\n   ne peut être imputé à l'ajusteur déterministe seul.`,
  );
}

const platsFinaux = (ligne.dishes ?? []) as Record<string, unknown>[];
const platsModele = (modele?.dishes ?? []) as Record<string, unknown>[];
const prepsFinales = (ligne.preparations ?? []) as Record<string, unknown>[];
const prepsModele = (modele?.preparations ?? []) as Record<string, unknown>[];

// ── LES PRÉPARATIONS : c'est là que vivent sauces, liants et appareils ────
console.log(`\n── PRÉPARATIONS ─────────────────────────────────────────────`);
const masseDesPreps = new Map<string, number>();
for (const p of prepsFinales) {
  const id = String(p.id ?? "");
  const av = prepsModele.find((x) => String(x.id ?? "") === id);
  const lignesApres = lignesDe(p);
  const fApres = ficheMassique(lignesApres);
  masseDesPreps.set(id, fApres.totalG);
  console.log(`\n· ${id} — « ${String(p.title ?? p.name ?? "")} »`);
  if (av) {
    const lignesAvant = lignesDe(av);
    console.log(rendreFiche("AVANT (premier jet)", ficheMassique(lignesAvant), lignesAvant.length));
    console.log(rendreFiche("APRÈS (en base)", fApres, lignesApres.length));
    const a = ficheMassique(lignesAvant);
    const ecarts: string[] = [];
    for (const pa of a.parts) {
      const pb = fApres.parts.find((x) => x.term === pa.term);
      if (!pb) continue;
      const dd = pb.part - pa.part;
      if (Math.abs(dd) >= 0.05) {
        ecarts.push(
          `       ${pa.term} : ${pa.part.toFixed(1)} % → ${pb.part.toFixed(1)} % ` +
            `(${dd >= 0 ? "+" : ""}${dd.toFixed(1)} pt de MASSE)`,
        );
      }
    }
    console.log(
      a.nonConverties.length > 0 || fApres.nonConverties.length > 0
        ? `     ⚠️ COMPARAISON PARTIELLE : ${a.nonConverties.length} ligne(s) hors` +
          ` dénominateur avant, ${fApres.nonConverties.length} après.`
        : `     ✅ les deux dénominateurs couvrent TOUTES les lignes.`,
    );
    console.log(
      ecarts.length === 0
        ? `     ✅ RAPPORTS MASSIQUES INCHANGÉS — la recette n'a été que mise à l'échelle.`
        : `     ⚠️ RAPPORTS MASSIQUES DÉPLACÉS :\n${ecarts.join("\n")}`,
    );
    console.log(`     facteurs par ligne (après ÷ avant) :`);
    for (const l of facteursParLigne(lignesAvant, lignesApres)) console.log(l);
  } else {
    console.log(rendreFiche("APRÈS (en base)", fApres, lignesApres.length));
  }
  if (TOUT) console.log(`     méthode : ${String(p.method ?? "")}`);
}

// ── LES PLATS, ET LE RAPPORT SAUCE / PLAT ────────────────────────────────
console.log(`\n── PLATS (frais assemblé) ───────────────────────────────────`);
for (const d of platsFinaux) {
  const k = cle(d);
  const av = platsModele.find((x) => cle(x) === k);
  const lignesApres = lignesDe(d);
  const fApres = ficheMassique(lignesApres);
  console.log(`\n· ${k} — « ${String(d.title ?? d.name ?? "")} »`);
  if (av) {
    const lignesAvant = lignesDe(av);
    console.log(rendreFiche("AVANT (premier jet)", ficheMassique(lignesAvant), lignesAvant.length));
  }
  console.log(rendreFiche("APRÈS (en base)", fApres, lignesApres.length));
  if (av) {
    console.log(`     facteurs par ligne (après ÷ avant) :`);
    for (const l of facteursParLigne(lignesDe(av), lignesApres)) console.log(l);
  }
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ LE RAPPORT SAUCE / PLAT NE SE LIT PAS DANS LA SAUCE
  // ══════════════════════════════════════════════════════════════════════
  //
  // « Les rapports internes seuls ne prouvent pas le rapport sauce/plat. »
  // Une sauce dont le tahini fait 30 % D'ELLE-MÊME peut représenter 5 % ou 40 %
  // de l'assiette : la question est la masse de la PRÉPARATION rapportée à la
  // masse TOTALE servie. On l'écrit quand on sait la calculer, et on s'abstient
  // en le disant quand une des deux masses manque.
  // ⛔ LE DÉNOMINATEUR EST LE CONTENANT SERVI, EN GRAMMES PRÊTS — et JAMAIS un
  // mélange avec les grammes CRUS des fiches ci-dessus. « On ne mélange pas deux
  // bases de mesure » est la première erreur listée par le socle, et elle a déjà
  // rendu 2 370 kcal là où les portions en valaient 2 455,69.
  const boites = (d.boxes ?? []) as Record<string, unknown>[];
  if (boites.length === 0) {
    console.log(
      `     ⚪ rapport préparation / assiette NON CALCULABLE : aucun contenant sur ce plat.`,
    );
  }
  for (const b of boites) {
    const items = (b.items ?? []) as Record<string, unknown>[];
    let total = 0;
    const parPrep = new Map<string, number>();
    let sansGrammes = 0;
    for (const it of items) {
      const g = typeof it.grams === "number" ? it.grams : null;
      if (g === null) {
        sansGrammes++;
        continue;
      }
      total += g;
      const pid = typeof it.preparation_id === "string" ? it.preparation_id : null;
      if (pid !== null) parPrep.set(pid, (parPrep.get(pid) ?? 0) + g);
    }
    console.log(
      `     rapport préparation / assiette — contenant ${String(b.id)} ` +
        `(${total.toFixed(0)} g PRÊTS, base distincte des grammes crus ci-dessus)` +
        (sansGrammes > 0 ? `   ⛔ ${sansGrammes} item(s) sans grammes, hors dénominateur` : ""),
    );
    if (total <= 0) {
      console.log(`       ⚪ aucun gramme lisible : rapport NON CALCULABLE.`);
      continue;
    }
    if (parPrep.size === 0) {
      console.log(
        `       ⚪ ce contenant ne prélève dans AUCUNE préparation : ` +
          `il n'y a pas de rapport sauce/plat à mesurer ici.`,
      );
      continue;
    }
    for (const [pid, g] of parPrep) {
      const massePrep = masseDesPreps.get(pid);
      console.log(
        `       ${((g / total) * 100).toFixed(1)} %   ${g.toFixed(0)} g prélevés dans ${pid}` +
          (massePrep === undefined
            ? `   (masse crue du lot inconnue)`
            : `   (lot : ${massePrep.toFixed(0)} g crus — ⚠️ base différente, pas un rapport)`),
      );
    }
  }
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
  console.log(
    `  pour ${String(p.servings_made ?? "?")} part(s) · ${String(p.total_minutes ?? "?")} min en tout, ` +
      `dont ${String(p.active_minutes ?? "?")} min de mains`,
  );
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
