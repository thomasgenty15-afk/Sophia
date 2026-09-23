#!/usr/bin/env -S deno run --allow-env --allow-net --allow-read
/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE BANC DU CORPUS MÉMOIRE — le VRAI classifieur, 47 notes, écarts par famille
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QU'IL MESURE, ET CE QU'AUCUN TEST NE PEUT MESURER ──────────────────
 * `draft_note_classify_corpus_test.ts` teste le PARSEUR sur des sorties modèle
 * en dur. Il ne dit rien de la seule question qui compte en vrai: **le modèle
 * range-t-il dans le bon tiroir ?** Ce banc appelle le modèle pour de bon, une
 * fois par note, et compare à `expected`.
 *
 * ⛔ CE N'EST PAS UN TEST, ET ÇA NE DOIT JAMAIS EN DEVENIR UN. Il coûte 47
 * appels, il varie d'un run à l'autre, et un rouge n'y veut pas dire « le code
 * est cassé » mais « le prompt ne tient pas sur ce cas ».
 *
 * ── ⛔ IL N'ÉCRIT RIEN, NULLE PART ────────────────────────────────────────
 * Aucune base, aucun compte, aucune fixture. Il construit la consigne
 * (`buildDraftNoteClassifyPrompt`), appelle le modèle, et relit la réponse par
 * `readDraftNoteClassification` — le même lecteur que la production. Un banc
 * qui écrirait 47 notes sur un foyer laisserait un état que personne ne sait
 * défaire.
 *
 * ── LA CLÉ VIT DANS LE RUNTIME, PAS DANS UN `.env` ────────────────────────
 * Cicatrice nommée du dépôt. Ce banc ne devine pas: sans clé lisible, il
 * REFUSE de démarrer plutôt que de rendre 47 zéros qui ressembleraient à un
 * prompt cassé.
 *
 * Usage:
 *   OPENAI_API_KEY=… deno run --allow-env --allow-net --allow-read \
 *     scripts/2026-09-21-2200-banc-corpus-memoire.ts [--only <id>] [--limit N] [--raw]
 *
 *   `--raw` imprime, pour chaque note EN ÉCART, la sortie brute du modèle — pour
 *   dire si c'est lui qui n'a rien rangé ou le lecteur qui a refusé.
 */

import {
  DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT,
  buildDraftNoteClassifyPrompt,
  readDraftNoteClassification,
} from "../supabase/functions/_shared/keel/draft_note_classify.ts";
import {
  CORPUS_MEMBERS,
  CORPUS_MEMBER_IDS,
  CORPUS_PLAN_FOODS,
  CORPUS_TARGET_WEEK,
  CORPUS_TODAY,
  type CorpusExpected,
  type CorpusMouth,
  DRAFT_NOTE_CORPUS,
} from "../supabase/functions/_shared/keel/draft_note_corpus.ts";
import { generateWithGemini } from "../supabase/functions/_shared/gemini.ts";
import { keelGenerationModel } from "../supabase/functions/_shared/keel/generation_model.ts";

// ── LA CLÉ, EXIGÉE AVANT TOUT ─────────────────────────────────────────────
const KEY = (Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY") ?? "").trim();
if (KEY === "") {
  console.error(
    "⛔ AUCUNE CLÉ DE MODÈLE LISIBLE (`OPENAI_API_KEY` / `GEMINI_API_KEY`).\n" +
      "   Ce banc refuse de tourner: sans clé, chaque note rendrait un échec\n" +
      "   d'appel, et 47 échecs d'appel ressemblent trait pour trait à un\n" +
      "   prompt qui ne range rien. La clé vit dans le RUNTIME des fonctions\n" +
      "   edge, pas dans un `.env` — exporte-la dans ce shell avant de lancer.",
  );
  Deno.exit(2);
}

const args = Deno.args;
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const limit = args.includes("--limit")
  ? Number(args[args.indexOf("--limit") + 1] || "0")
  : 0;
const showRaw = args.includes("--raw");

const MOUTH_OF = new Map(
  (Object.entries(CORPUS_MEMBER_IDS) as [CorpusMouth, string][])
    .map(([mouth, uuid]) => [uuid, mouth] as const),
);
const whoOf = (subject: unknown): CorpusMouth | null => {
  const s = String(subject ?? "");
  if (s === "household" || s === "") return null;
  const uuid = s.startsWith("member:") ? s.slice(7) : s;
  return MOUTH_OF.get(uuid) ?? null;
};

const BLANK = {
  kind: null, text: null, occasion: null, force: null, who: null, direction: null,
  about: null, light: null, weekday: null, why: null, ask: null, gate: null, safety: null,
} as const;

/** ⚠️ LE MÊME APLATISSEMENT QUE LE TEST, et c'est voulu: deux lectures
 * divergeraient, et c'est celle qu'on relit le moins qui décrirait le produit. */
function flatten(c: ReturnType<typeof readDraftNoteClassification>["classification"]) {
  const out: CorpusExpected[] = [];
  const occ = (row: unknown) =>
    ((row as { occasion?: unknown } | null)?.occasion ?? null) as CorpusExpected["occasion"];
  const frc = (row: unknown) => {
    const kind = String((row as { kind?: unknown } | null)?.kind ?? "");
    if (kind !== "food.exclude" && kind !== "method.avoid") return null;
    const v = (row as { force?: unknown } | null)?.force ?? null;
    return (v === "less" ? "less" : v === "never" ? "never" : null) as CorpusExpected["force"];
  };
  for (const i of c.preferences.items) {
    out.push({ ...BLANK, drawer: "preferences", kind: i.kind, text: i.text, occasion: occ(i), force: frc(i), who: whoOf(i.subject) });
  }
  for (const e of c.nextPlan.entries) {
    out.push({ ...BLANK, drawer: "next_plan", kind: e.item.kind, text: e.item.text, occasion: occ(e.item), force: frc(e.item), who: whoOf(e.item.subject) });
  }
  for (const l of c.notes.lines) {
    out.push({ ...BLANK, drawer: "notes", text: l.text, occasion: (l.when?.slot ?? null) as CorpusExpected["occasion"], weekday: (l.when?.weekday ?? null) as CorpusExpected["weekday"], who: whoOf(l.subject) });
  }
  for (const m of c.portions.moves) {
    out.push({ ...BLANK, drawer: "portions", direction: m.direction, who: whoOf(`member:${m.memberId}`) });
  }
  for (const m of c.settings.moves) {
    out.push({ ...BLANK, drawer: "settings", about: m.about, direction: m.direction });
  }
  for (const m of c.slots.moves) {
    out.push({ ...BLANK, drawer: "slots", occasion: m.slot as CorpusExpected["occasion"], light: m.light, who: m.memberId === null ? null : whoOf(`member:${m.memberId}`) });
  }
  for (const cell of c.cells.requests) {
    out.push({ ...BLANK, drawer: "cells", text: cell.text, weekday: cell.day as CorpusExpected["weekday"], occasion: cell.slot as CorpusExpected["occasion"] });
  }
  const s = c.skipped;
  for (const [why, n] of [["degree", s.degree], ["setting", s.setting], ["meal_story", s.mealStory], ["other", s.other]] as const) {
    for (let i = 0; i < n; i++) out.push({ ...BLANK, drawer: "skipped", why: why as CorpusExpected["why"] });
  }
  for (const d of c.safety.declarations) {
    out.push({ ...BLANK, drawer: "safety", text: d.text, who: whoOf(`member:${d.memberId}`), safety: d.kind === "diet" ? `diet:${d.diet}` : d.kind });
  }
  for (const e of c.clarify.entries) {
    out.push({ ...BLANK, drawer: "clarify", ask: e.about, gate: e.gate });
  }
  for (const _q of c.clarify.portions) {
    out.push({ ...BLANK, drawer: "clarify", ask: "who", gate: "portions" });
  }
  return out;
}

/**
 * ⚠️ LA COMPARAISON PORTE SUR LE TIROIR ET LA FAMILLE, PAS SUR LE TEXTE.
 * Le modèle écrit « les œufs » ou « œufs » selon son humeur, et exiger l'octet
 * mesurerait sa ponctuation. Ce qui compte est: a-t-il rangé la bonne chose au
 * bon endroit, avec le bon moment, pour la bonne bouche.
 */
const keyOf = (e: CorpusExpected) =>
  JSON.stringify([e.drawer, e.kind, e.occasion, e.force, e.who, e.direction, e.about, e.light, e.weekday, e.why, e.ask, e.gate, e.safety]);

const model = keelGenerationModel();
const tally = new Map<string, { attendu: number; rendu: number; exact: number }>();
const bump = (drawer: string, k: "attendu" | "rendu" | "exact") => {
  const row = tally.get(drawer) ?? { attendu: 0, rendu: 0, exact: 0 };
  row[k] += 1;
  tally.set(drawer, row);
};

let ran = 0;
let exactNotes = 0;
const failures: {
  id: string; why: string; attendu: string[]; rendu: string[]; lecteur: string; raw: unknown;
}[] = [];

/**
 * ⚠️ « (rien) » CACHAIT DEUX DÉFAUTS SOUS UN SEUL MOT: un modèle qui ne range
 * rien, et un lecteur qui refuse ce que le modèle a rangé. Le 2026-09-22 le
 * banc a rendu `(rien)` sur une note passée deux fois avant, et il a fallu
 * relancer pour savoir lequel des deux. Cette ligne le dit du premier coup:
 * le refus global s'il y en a un, sinon par tiroir « proposé / gardé » et
 * chaque compteur de refus NOMMÉ qui a bougé.
 */
function lecteurLine(out: ReturnType<typeof readDraftNoteClassification>): string {
  if (!out.ok) return `lecteur: REFUS GLOBAL ${out.refusal}`;
  const c = out.classification;
  const drawers: [string, { readonly proposed: number; readonly kept: number; readonly refused: object }][] = [
    ["preferences", c.preferences], ["next_plan", c.nextPlan], ["notes", c.notes],
    ["portions", c.portions], ["settings", c.settings], ["slots", c.slots], ["cells", c.cells],
  ];
  const parts: string[] = [];
  for (const [name, d] of drawers) {
    if (d.proposed === 0) continue;
    const named = Object.entries(d.refused)
      .filter(([k, v]) => k !== "total" && ((typeof v === "number" && v > 0) || (Array.isArray(v) && v.length > 0)))
      .map(([k, v]) => `${k}:${Array.isArray(v) ? v.join("|") : v}`);
    parts.push(`${name} proposé ${d.proposed} gardé ${d.kept}${named.length ? ` refusé {${named.join(", ")}}` : ""}`);
  }
  const s = c.skipped;
  if (s.total > 0) parts.push(`skipped ${s.total}${s.unknown > 0 ? ` (motif inconnu ${s.unknown})` : ""}`);
  return `lecteur: ok · ${parts.length ? parts.join(" · ") : "aucun tiroir proposé"}`;
}

for (const entry of DRAFT_NOTE_CORPUS) {
  if (only && entry.id !== only) continue;
  if (limit > 0 && ran >= limit) break;
  ran += 1;
  const userPrompt = buildDraftNoteClassifyPrompt({
    note: entry.note,
    contentLocale: "fr-FR",
    members: CORPUS_MEMBERS,
    planFoods: CORPUS_PLAN_FOODS,
  });
  let raw: unknown = null;
  try {
    raw = await generateWithGemini(
      DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT,
      userPrompt,
      0,
      true,
      [],
      "auto",
      { source: "banc-corpus-memoire", model, forceInitialModel: true, httpTimeoutMs: 25_000, maxRetries: 1 },
    );
  } catch (error) {
    console.error(`[${entry.id}] appel modèle en échec: ${String(error)}`);
    failures.push({ id: entry.id, why: "model_unavailable", attendu: [], rendu: [], lecteur: "lecteur: pas appelé", raw: null });
    continue;
  }
  const out = readDraftNoteClassification({
    raw,
    today: CORPUS_TODAY,
    targetWeek: CORPUS_TARGET_WEEK,
    members: CORPUS_MEMBERS,
    note: entry.note,
    writtenAt: null,
    planFoods: CORPUS_PLAN_FOODS,
  });
  const attendu = entry.expected.map(keyOf).sort();
  const rendu = out.ok ? flatten(out.classification).map(keyOf).sort() : [];

  // ── LES ÉCARTS PAR TIROIR, avec DÉNOMINATEUR ────────────────────────────
  // ⚠️ `attendu` ET `rendu` SÉPARÉMENT: un tiroir jamais rempli et un tiroir
  // rempli de travers rendent le même « pas exact », et ce n'est pas le même
  // défaut — le premier est un prompt qui ne propose rien, le second un prompt
  // qui propose mal.
  const restant = [...rendu];
  for (const k of attendu) {
    const drawer = JSON.parse(k)[0] as string;
    bump(drawer, "attendu");
    const at = restant.indexOf(k);
    if (at >= 0) {
      restant.splice(at, 1);
      bump(drawer, "exact");
    }
  }
  for (const k of restant) bump(JSON.parse(k)[0] as string, "rendu");

  const ok = attendu.length === rendu.length && attendu.every((k, i) => k === rendu[i]);
  if (ok) exactNotes += 1;
  else failures.push({ id: entry.id, why: entry.why, attendu, rendu, lecteur: lecteurLine(out), raw });
  console.log(`${ok ? "✓" : "✗"} ${entry.id}`);
}

console.log("\n═══ ÉCARTS PAR TIROIR ═══");
console.log("tiroir".padEnd(14), "attendu".padStart(8), "exact".padStart(8), "en trop".padStart(8));
for (const [drawer, row] of [...tally].sort()) {
  console.log(
    drawer.padEnd(14),
    String(row.attendu).padStart(8),
    String(row.exact).padStart(8),
    String(row.rendu).padStart(8),
  );
}
console.log(`\nnotes exactes: ${exactNotes}/${ran}  ·  modèle: ${model}`);
if (failures.length > 0) {
  console.log("\n═══ LES ÉCARTS, CAS PAR CAS ═══");
  for (const f of failures) {
    console.log(`\n── ${f.id} — ${f.why}`);
    console.log("   attendu:", f.attendu.join("\n            ") || "(rien)");
    console.log("   rendu  :", f.rendu.join("\n            ") || "(rien)");
    console.log("  ", f.lecteur);
    if (showRaw) console.log("   brut   :", JSON.stringify(f.raw));
  }
}
