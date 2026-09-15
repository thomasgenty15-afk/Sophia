/**
 * ══════════════════════════════════════════════════════════════════════════
 * §2.1 / §2.2 — LE PLAN **ÉCRIT**, RELU EN BASE ET VÉRIFIÉ APRÈS LA
 *               FINALISATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read --allow-env --allow-net \
 *     scratchpad/2026-09-13-ISOLEMENT-ET-COMPLEMENT/verifier-plan-ecrit.ts <plan-id>
 *
 * ⛔ IL RELIT LA BASE, PAS LA RÉPONSE HTTP. « Un HTTP 200 n'est jamais une
 * preuve de conformité » : chaque nombre ci-dessous sort de
 * `student_generated_meals`, lu par PostgREST, après l'écriture.
 *
 * ⛔ ET IL NE RECODE AUCUNE ÉQUATION. L'énergie et la masse prête d'une unité
 * viennent de `dishEnergy` + `weighedReadyGrams` ; le pliage d'une casserole
 * dans un plat vient de `foldPreparationsIntoDishes`. Ce sont les lecteurs de
 * production.
 */
import { indexDuReferentiel } from "../2026-09-13-CIBLES-PAR-PERSONNE/composer-reference.ts";
import { dishEnergy } from "../../supabase/functions/_shared/keel/plan_energy.ts";
import { weighedReadyGrams } from "../../supabase/functions/_shared/keel/box_densify.ts";
import { foldPreparationsIntoDishes } from "../../supabase/functions/_shared/keel/meal_verdict.ts";

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
  console.error("usage : verifier-plan-ecrit.ts <plan-id> [--lot=prep_x] [--bouche=<uuid>]");
  Deno.exit(2);
}

const res = await fetch(
  `${API}/rest/v1/student_generated_meals?id=eq.${PLAN}&select=*`,
  { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
);
const rows = await res.json() as Record<string, unknown>[];
const ligne = rows[0];
if (!ligne) {
  console.error(`⛔ aucun plan ${PLAN} en base — il n'y a rien à relire.`);
  Deno.exit(2);
}
console.log(`── PLAN RELU EN BASE ${PLAN} ─────────────────────────────────`);
console.log(
  `   fenêtre ${ligne.starts_on} → ${ligne.ends_on} · retired_at=${ligne.retired_at} · ` +
    `validated_at=${ligne.validated_at} · updated_at=${ligne.updated_at}`,
);

type Ligne = {
  term: string;
  ref?: string | null;
  amount?: number | null;
  unit?: string | null;
  state?: string | null;
  quantity?: string | null;
};
type Plat = {
  title?: string;
  name?: string;
  day?: string;
  slot?: string;
  /**
   * ⛔ DEUX GRAPHIES, ET C'EST LE PLAN ÉCRIT QUI L'IMPOSE. Le JSON du modèle
   * écrit `for_member_id` ; la LIGNE PERSISTÉE écrit `member_id`
   * (`mealDishesPayload`). Ne lire que la première faisait afficher « table »
   * sous chaque plat dédié du plan relu — un plat propriétaire lu comme un plat
   * partagé, c'est-à-dire le contraire de ce que ce fichier vérifie.
   */
  for_member_id?: string | null;
  member_id?: string | null;
  complements_shared?: boolean;
  ingredients?: Ligne[];
  uses?: { preparation_id?: string; servings?: number }[];
  method?: string;
  boxes?: { id?: string; member_ids?: string[]; items?: unknown[] }[];
};
type Pot = {
  id: string;
  title?: string;
  servings_made?: number;
  cook_on?: string | null;
  ingredients?: Ligne[];
  method?: string;
};
type Session = {
  day?: string | null;
  preparation_ids?: string[];
  run_through?: string;
};

const dishes = (ligne.dishes ?? []) as Plat[];
/** Le propriétaire d'un plat, sous l'une ou l'autre de ses deux graphies. */
const proprio = (d: Plat): string =>
  String(d.for_member_id ?? d.member_id ?? "").trim();
const pots = (ligne.preparations ?? []) as Pot[];
const sessions = (ligne.cooking_sessions ?? []) as Session[];
const courses = (ligne.shopping_list ?? []) as Ligne[];

// ═══════════════════════════════════════════════════════════════════════════
// ① LES CASSEROLES, LEUR JOUR, ET LA SESSION QUI LES CUISINE
// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n── ① CASSEROLES · SESSIONS ───────────────────────────────────`);
let dur = 0;
const rate = (quoi: string) => {
  dur++;
  console.log(`   ⛔ ${quoi}`);
};
for (const p of pots) {
  const citee = sessions
    .map((s, i) => ({ i, s }))
    .filter((x) => (x.s.preparation_ids ?? []).includes(p.id));
  console.log(
    `   ${p.id.padEnd(24)} ${String(p.servings_made ?? "?").padStart(2)} part(s) · ` +
      `cook_on=${String(p.cook_on ?? "—").padEnd(4)} · session(s) ${
        citee.length === 0 ? "AUCUNE" : citee.map((x) => `S${x.i + 1}(${x.s.day})`).join(", ")
      }`,
  );
  if (citee.length === 0) rate(`${p.id} n'est cuisinée par AUCUNE session`);
  for (const x of citee) {
    if (String(x.s.day ?? "") !== String(p.cook_on ?? "")) {
      rate(`${p.id} : cook_on=${p.cook_on} mais la session S${x.i + 1} est le ${x.s.day}`);
    }
  }
}
const idsConnus = new Set(pots.map((p) => p.id));
for (const [i, s] of sessions.entries()) {
  for (const id of s.preparation_ids ?? []) {
    if (!idsConnus.has(id)) rate(`S${i + 1} cite ${id}, qui n'existe pas dans le plan`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ② QUI PUISE DANS QUOI — ET COMBIEN DE PARTS
// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n── ② PRÉLÈVEMENTS PAR CASSEROLE ──────────────────────────────`);
for (const p of pots) {
  const tirages = dishes.flatMap((d) =>
    (d.uses ?? []).filter((u) => u.preparation_id === p.id).map((u) => ({
      d,
      parts: Number(u.servings ?? 1),
    }))
  );
  const total = tirages.reduce((n, t) => n + t.parts, 0);
  const faites = Number(p.servings_made ?? 0);
  console.log(
    `   ${p.id.padEnd(24)} produit ${faites} · prélevé ${total} · reste ${
      (faites - total).toFixed(2)
    }`,
  );
  for (const t of tirages) {
    console.log(
      `        ← ${String(t.d.day).padEnd(3)} ${String(t.d.slot).padEnd(9)} ` +
        `${t.parts} part(s) · ${proprio(t.d) ? `DÉDIÉ ${String(proprio(t.d)).slice(0, 8)}` : "table"} ` +
        `« ${String(t.d.title ?? t.d.name ?? "?").slice(0, 44)} »`,
    );
  }
  if (total > faites + 1e-6) {
    rate(`${p.id} : on y puise ${total} parts pour ${faites} produites`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LES ACHATS — UNE FOIS, ET ASSEZ
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE STOCK SE SOUSTRAIT UNE SEULE FOIS : un lot cuisiné une fois s'achète
// une fois, quel que soit le nombre de plats qui y puisent. On additionne donc
// les lignes FRAÎCHES des plats + les lignes des casseroles COMPTÉES UNE FOIS,
// et on compare à la liste de courses.
console.log(`\n── ③ ACHATS : BESOIN CONTRE LISTE ────────────────────────────`);
const besoin = new Map<string, number>();
const ajoute = (l: Ligne) => {
  const ref = String(l.ref ?? "").trim();
  const g = Number(l.amount);
  if (ref === "" || !Number.isFinite(g)) return;
  besoin.set(ref, (besoin.get(ref) ?? 0) + g);
};
for (const d of dishes) for (const l of d.ingredients ?? []) ajoute(l);
for (const p of pots) for (const l of p.ingredients ?? []) ajoute(l);
const achete = new Map<string, number>();
for (const l of courses) {
  const ref = String(l.ref ?? "").trim();
  const g = Number(l.amount);
  if (ref === "" || !Number.isFinite(g)) continue;
  achete.set(ref, (achete.get(ref) ?? 0) + g);
}
for (const [ref, g] of [...besoin].sort()) {
  const a = achete.get(ref);
  const etat = a === undefined
    ? "⛔ ABSENT DE LA LISTE"
    : a + 0.5 < g
    ? `⛔ COURT (${a} < ${g.toFixed(0)})`
    : a > g * 2.001
    ? `⛔ ACHETÉ DEUX FOIS OU PLUS (${a} pour ${g.toFixed(0)} nécessaires)`
    : "✅";
  console.log(
    `   ${ref.padEnd(22)} besoin ${g.toFixed(0).padStart(6)} g · acheté ${
      String(a ?? "—").padStart(6)
    } g  ${etat}`,
  );
  if (etat.startsWith("⛔")) rate(`${ref} : ${etat}`);
}
for (const [ref, g] of [...achete].sort()) {
  if (!besoin.has(ref)) {
    rate(`${ref} acheté (${g} g) sans qu'aucune recette ne le demande`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ CHAQUE CASE, MESURÉE PAR LES LECTEURS DE PRODUCTION
// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n── ④ CASES · DENSITÉ SERVIE ET PART DE CHACUN ────────────────`);
const index = await indexDuReferentiel();
const plies = foldPreparationsIntoDishes({
  dishes: dishes.map((d) => ({
    slot: d.slot ?? null,
    method: d.method ?? "",
    ingredients: (d.ingredients ?? []) as never,
    uses: (d.uses ?? []).map((u) => ({
      preparationId: String(u.preparation_id ?? ""),
      servings: Number(u.servings ?? 1),
    })),
  })),
  preparations: pots.map((p) => ({
    id: p.id,
    servingsMade: Number(p.servings_made ?? 1),
    ingredients: (p.ingredients ?? []) as never,
  })),
});
for (const [i, d] of dishes.entries()) {
  const unite = { method: d.method ?? "", ingredients: plies[i].ingredients as never };
  const e = dishEnergy(index, unite as never);
  const ready = weighedReadyGrams(plies[i].ingredients as never, index);
  // ⚠️ `e.kcal` PEUT ÊTRE `null` MÊME QUAND `complete` EST VRAI, du point de
  // vue du compilateur : on le teste, on ne le suppose pas.
  const rho = e.complete && e.kcal !== null && ready !== null && ready > 0
    ? (e.kcal / ready) * 100
    : null;
  const boites = (d.boxes ?? []).map((b) =>
    `${(b.member_ids ?? []).map((m) => String(m).slice(0, 8)).join("+") || "—"}`
  );
  console.log(
    `   ${String(d.day).padEnd(3)} ${String(d.slot).padEnd(9)} ` +
      `${(proprio(d) ? `DÉDIÉ ${String(proprio(d)).slice(0, 8)}` : "table").padEnd(15)} ` +
      `${d.complements_shared === true ? "COMPLÉMENT " : ""}` +
      `ρ=${rho === null ? "  illisible" : rho.toFixed(1).padStart(6)} · ` +
      `lots ${(d.uses ?? []).map((u) => u.preparation_id).join(",") || "—"} · ` +
      `boîtes ${boites.join(" | ") || "—"}`,
  );
}

console.log(
  `\n${dur === 0 ? "✅ AUCUNE INCOHÉRENCE" : `⛔ ${dur} INCOHÉRENCE(S)`} sur le plan écrit.`,
);
if (dur > 0) Deno.exit(1);
