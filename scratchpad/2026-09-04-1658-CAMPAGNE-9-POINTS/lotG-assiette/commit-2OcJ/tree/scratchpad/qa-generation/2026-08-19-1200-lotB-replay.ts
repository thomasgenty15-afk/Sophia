// ═══════════════════════════════════════════════════════════════════════════
// LOT B — REJEU DES PLANS ARCHIVÉS, AVANT / APRÈS. Aucun modèle, aucun run.
//
// Ce qui est REJOUÉ: `householdMouthFactors`, `sizeBoxesFromTarget` et
// `attachSizedQuantities` sur les SORTIES BRUTES du modèle archivées
// (`dump/output.json`), avec le roster archivé (`inputs.json`).
//
// ⚠️ LE « AVANT » N'EST PAS UNE SUPPOSITION: il est reconstruit ici par la
// règle exacte d'avant le lot, et il est VÉRIFIÉ contre les compteurs que le
// plan a réellement écrits (`plan-written.json` → `household.box_sizing`). Si
// la reconstruction ne reproduit pas `sized` / `shared_mixed` / `unchanged`,
// le script le DIT et le rejeu ne prouve rien.
//
//   deno run --allow-read scratchpad/qa-generation/2026-08-19-1200-lotB-replay.ts
// ═══════════════════════════════════════════════════════════════════════════
import {
  attachSizedQuantities,
  householdMouthFactors,
  sizeBoxesFromTarget,
} from "../../supabase/functions/_shared/keel/household_portions.ts";

const ROOT = new URL("./05-qualite-foyer/", import.meta.url);
const RUNS = ["plan-1", "plan-2", "plan-3", "plan-4", "plan-5", "onedish-1"];
const TOL = 1.1;

/** Âges au 2026-08-19, lus dans la fixture (`…-5a-fixture-foyer-qualite.sql`). */
const AGE: Record<string, number> = { Roxane: 38, Ivar: 40, Lubna: 34, Zoe: 7 };
/** Le cran réglé au curseur, tel que la fixture de BASE le pose. */
const PACE: Record<string, number | null> = {
  Roxane: 0.3,
  Ivar: null,
  Lubna: null,
  Zoe: null,
};

type Json = Record<string, unknown>;
const read = (p: string): Json => JSON.parse(Deno.readTextFileSync(new URL(p, ROOT)));

function modelOutput(run: string): Json {
  const dump = read(`${run}/dump/output.json`);
  const result = dump.result as Json;
  const j = result.output_text_json ?? JSON.parse(String(result.output_text ?? "{}"));
  return j as Json;
}

function roster(run: string) {
  const inputs = read(`${run}/inputs.json`);
  return (inputs.roster as Json[]).map((r) => {
    const b = r.body as Json | null;
    const name = String(r.first_name);
    return {
      memberId: String(r.member_id),
      name,
      ageState: String(r.age_state) as "adult" | "minor" | "unknown",
      goal: (r.goal ?? null) as string | null,
      hasAccount: Boolean(r.has_account),
      body: b === null ? null : {
        heightCm: Number(b.height_cm),
        weightKg: Number(b.weight_kg),
        gender: String(b.gender),
        ageYears: AGE[name] ?? null,
        activityLevel: (b.activity_level ?? null) as string | null,
      },
      pace: PACE[name] ?? null,
    };
  });
}

// deno-lint-ignore no-explicit-any
function factorsOf(run: string): { now: Map<string, any>; before: Map<string, number> } {
  const mouths = roster(run);
  // deno-lint-ignore no-explicit-any
  const input: any[] = mouths.map((m) => ({
    member: {
      memberId: m.memberId,
      displayName: m.name,
      goal: m.goal,
      ageState: m.ageState,
      body: null,
      eatingSlots: null,
      habits: [],
      habitNote: null,
    },
    // Le maître a un compte et sa ceinture est `clear` sur la fixture; les
    // trois autres n'en ont pas.
    restriction: m.hasAccount ? "clear" : "no_account",
    body: m.body,
    paceKgPerWeek: m.pace,
  }));
  // deno-lint-ignore no-explicit-any
  const now = householdMouthFactors(input as any, "no_position");
  // ── LE « AVANT », RECONSTRUIT PAR LA RÈGLE EXACTE D'AVANT LE LOT ────────
  // La chaîne d'OBJECTIF exigeait un cran réglé; sans lui, facteur 1. La
  // chaîne de MAINTENANCE n'a pas changé sur ce décor (`no_position`), donc le
  // facteur d'avant est `share × (cran réglé ? target : 1)`, raboté pareil.
  const before = new Map<string, number>();
  for (const m of mouths) {
    const f = now.get(m.memberId)!;
    const raw = m.pace === null ? f.share.factor : f.share.factor * f.target.factor;
    before.set(m.memberId, Math.min(1.45, Math.max(0.55, raw)));
  }
  return { now, before };
}

/** LA RÈGLE D'AVANT LE LOT, sur les boîtes: une boîte partagée à facteurs divergents ne bouge pas. */
function sizeBoxesBefore(
  // deno-lint-ignore no-explicit-any
  preps: any[],
  factors: ReadonlyMap<string, number>,
) {
  const grams = new Map<string, number>();
  const counts = { boxes: 0, sized: 0, unchanged: 0, shared_mixed: 0 };
  for (const prep of preps) {
    const candidate = new Map<string, number>();
    let anySized = false;
    for (const box of prep.boxes ?? []) {
      counts.boxes++;
      const fs = (box.member_ids ?? box.memberIds ?? []).map((id: string) => factors.get(id) ?? 1);
      const first = fs[0] ?? 1;
      if (!fs.every((f: number) => Math.abs(f - first) < 1e-9)) {
        counts.shared_mixed++;
        candidate.set(box.id, box.grams);
        continue;
      }
      if (first === 1) {
        counts.unchanged++;
        candidate.set(box.id, box.grams);
        continue;
      }
      anySized = true;
      candidate.set(box.id, Math.max(1, Math.round(box.grams * first)));
    }
    if (!anySized) continue;
    for (const [id, g] of candidate) {
      grams.set(id, g);
      const box = (prep.boxes ?? []).find((b: Json) => b.id === id);
      if (box && g !== box.grams) counts.sized++;
    }
  }
  counts.unchanged = counts.boxes - counts.sized - counts.shared_mixed;
  return { grams, counts };
}

// deno-lint-ignore no-explicit-any
function sizable(preps: any[]) {
  return preps.map((p) => ({
    id: String(p.id),
    // ⚠️ `readyGrams: null` — la production n'est pas reconstructible sans le
    // référentiel de composition. Le plafond de récipient ne tourne donc pas
    // dans ce rejeu, exactement comme sur les préparations `unverifiable` des
    // plans archivés. C'est une RÉSERVE, et elle est écrite dans le rapport.
    readyGrams: null,
    boxes: (p.boxes ?? []).map((b: Json) => ({
      id: String(b.id),
      memberIds: (b.member_ids ?? b.memberIds ?? []) as string[],
      grams: Number(b.grams),
    })),
  }));
}

// deno-lint-ignore no-explicit-any
function portionsOf(preps: any[], mouths: ReturnType<typeof roster>) {
  return mouths.map((m) => ({
    memberId: m.memberId,
    displayName: m.name,
    portionNote: null,
    preparationShares: [],
  }));
}

console.log(
  "run".padEnd(10),
  "| boîtes  sized  shared  → sized  shared_scaled | archive(sized/shared)",
);
let gTotalBefore = 0;
let gTotalAfter = 0;
let gUnsizedBefore = 0;
const perMouth: Record<string, { before: number; after: number }> = {};

for (const run of RUNS) {
  let model: Json;
  try {
    model = modelOutput(run);
  } catch (e) {
    console.log(run.padEnd(10), "| illisible:", (e as Error).message);
    continue;
  }
  // deno-lint-ignore no-explicit-any
  const preps = (model.preparations ?? []) as any[];
  if (preps.length === 0) {
    console.log(run.padEnd(10), "| aucune préparation dans la sortie brute");
    continue;
  }
  const mouths = roster(run);
  const { now, before } = factorsOf(run);
  const nowFactors = new Map<string, number>();
  for (const [id, f] of now) if (f.factor !== 1) nowFactors.set(id, f.factor);

  const sizedBefore = sizeBoxesBefore(preps, before);
  const sizedAfter = sizeBoxesFromTarget(sizable(preps), nowFactors, TOL);

  // ── LA VÉRIFICATION DU « AVANT » CONTRE L'ARCHIVE ────────────────────
  let archived = "—";
  try {
    const written = read(`${run}/plan-written.json`);
    const bs = ((written.household as Json)?.box_sizing ?? {}) as Json;
    archived = `${bs.sized}/${bs.shared_mixed}`;
  } catch { /* certains runs n'ont pas de plan écrit */ }

  console.log(
    run.padEnd(10),
    "|",
    String(sizedBefore.counts.boxes).padStart(5),
    String(sizedBefore.counts.sized).padStart(6),
    String(sizedBefore.counts.shared_mixed).padStart(7),
    "  →",
    String(sizedAfter.counts.sized).padStart(5),
    String(sizedAfter.counts.shared_scaled).padStart(13),
    "|",
    archived,
  );

  // ── LES GRAMMES QUE CHAQUE BOUCHE LIT, AVANT ET APRÈS ───────────────
  const applied = (
    // deno-lint-ignore no-explicit-any
    grams: Map<string, number>,
    // deno-lint-ignore no-explicit-any
    factors: ReadonlyMap<string, number>,
    attach: boolean,
  ) => {
    const preparations = preps.map((p) => ({
      id: String(p.id),
      title: String(p.title ?? p.id),
      boxes: (p.boxes ?? []).map((b: Json) => ({
        memberIds: (b.member_ids ?? b.memberIds ?? []) as string[],
        grams: grams.get(String(b.id)) ?? Number(b.grams),
      })),
    }));
    return attachSizedQuantities(
      portionsOf(preps, mouths),
      preparations,
      attach ? factors : new Map(),
    );
  };
  const beforeNotes = applied(sizedBefore.grams, before, false);
  const afterNotes = applied(sizedAfter.grams, nowFactors, true);
  for (let i = 0; i < mouths.length; i++) {
    const m = mouths[i];
    const g = (note: string | null) =>
      (note ?? "").match(/(\d+) g/g)?.reduce((a, s) => a + Number(s.replace(" g", "")), 0) ?? 0;
    const b = g(beforeNotes.portions[i].portionNote);
    const a = g(afterNotes.portions[i].portionNote);
    perMouth[m.name] ??= { before: 0, after: 0 };
    perMouth[m.name].before += b;
    perMouth[m.name].after += a;
    gTotalBefore += b;
    gTotalAfter += a;
  }
  // Les grammes issus d'une boîte NON dimensionnée, avant.
  for (const p of preps) {
    for (const box of p.boxes ?? []) {
      const ids = (box.member_ids ?? box.memberIds ?? []) as string[];
      const fs = ids.map((id) => before.get(id) ?? 1);
      const first = fs[0] ?? 1;
      if (!fs.every((f) => Math.abs(f - first) < 1e-9)) {
        gUnsizedBefore += Number(box.grams) * ids.length;
      }
    }
  }
}

console.log("");
console.log("grammes servis (somme des phrases de table, tous runs)");
console.log("  avant:", gTotalBefore, " après:", gTotalAfter);
console.log(
  "  part issue d'une boîte NON dimensionnée, avant:",
  ((gUnsizedBefore / gTotalBefore) * 100).toFixed(1) + "%",
);
console.log("");
console.log("par bouche (somme des grammes lus à table, tous runs)");
for (const [name, v] of Object.entries(perMouth)) {
  console.log(
    " ",
    name.padEnd(8),
    String(v.before).padStart(6),
    "→",
    String(v.after).padStart(6),
    ((v.after / (v.before || 1) - 1) * 100).toFixed(1) + "%",
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LES MOTIFS DE LA CHAÎNE D'OBJECTIF, AVANT ET APRÈS — par bouche
// ═══════════════════════════════════════════════════════════════════════════
console.log("");
console.log("① chaîne d'objectif (plan-4, roster de base)");
{
  const mouths = roster("plan-4");
  const { now, before } = factorsOf("plan-4");
  for (const m of mouths) {
    const f = now.get(m.memberId)!;
    console.log(
      " ",
      m.name.padEnd(8),
      (m.goal ?? "—").padEnd(12),
      "cran:",
      String(m.pace ?? "—").padEnd(5),
      "| part",
      f.share.factor.toFixed(4),
      "| objectif",
      f.target.factor.toFixed(4),
      f.target.reason.padEnd(18),
      "| appliqué avant",
      before.get(m.memberId)!.toFixed(4),
      "→ après",
      f.factor.toFixed(4),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LE CAS CITÉ DANS LE RAPPORT — plan-4, le quinoa
// ═══════════════════════════════════════════════════════════════════════════
console.log("");
console.log("② plan-4 · les boîtes de quinoa, avant et après");
{
  const model = modelOutput("plan-4");
  // deno-lint-ignore no-explicit-any
  const preps = (model.preparations ?? []) as any[];
  const mouths = roster("plan-4");
  const byId = new Map(mouths.map((m) => [m.memberId, m.name]));
  const { now, before } = factorsOf("plan-4");
  const nowFactors = new Map<string, number>();
  for (const [id, f] of now) if (f.factor !== 1) nowFactors.set(id, f.factor);
  const after = sizeBoxesFromTarget(sizable(preps), nowFactors, TOL);
  const beforeBoxes = sizeBoxesBefore(preps, before);
  for (const p of preps) {
    for (const box of p.boxes ?? []) {
      const ids = (box.member_ids ?? box.memberIds ?? []) as string[];
      if (!String(box.id).includes("quinoa")) continue;
      const b = beforeBoxes.grams.get(String(box.id)) ?? Number(box.grams);
      const a = after.grams.get(String(box.id)) ?? Number(box.grams);
      const fs = ids.map((id) => nowFactors.get(id) ?? 1);
      const mean = fs.reduce((x, y) => x + y, 0) / fs.length;
      const shares = ids.map((id, i) =>
        `${byId.get(id)}: ${Math.max(1, Math.round(a * ((nowFactors.get(id) ?? 1) / mean)))} g`
      );
      console.log(
        " ",
        String(box.id).padEnd(22),
        "[" + ids.map((i) => byId.get(i)).join(", ") + "]",
        "étiquette", b, "g →", a, "g |",
        "phrase de table:", shares.join(" · "),
      );
    }
  }
}
