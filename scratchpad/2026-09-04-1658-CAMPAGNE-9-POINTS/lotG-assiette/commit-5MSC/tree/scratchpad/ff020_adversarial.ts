/**
 * FF-020 — REVUE ADVERSARIALE. Chaque hypothèse est écrite AVANT son test.
 *
 * A1  Le chemin de repli fait de l'I/O (un `await`, une lecture DB, un fetch)
 *     → le mode de panne serait dans le gestionnaire de panne (R1, §3).
 * A3  Un `kind` de ressource traduit ou inventé atteint le résolveur, et son
 *     `throw` (R4) tue un tour de crise — alors que §3 interdit le throw sur
 *     ce chemin.
 * A5  Le « repli du repli » (`needsFallback` dans visible_agent) est atteignable
 *     avec des ressources vides, ou au contraire mort.
 * A6  Un `profiles.country` SALE (casse, espaces, nom long, code non attribué)
 *     fabrique un numéro de pays VOISIN au lieu du jeu ZZ (R2).
 * A9  Un `kind` inconnu rend un message vide (R5) — ou, depuis le correctif §8,
 *     un TypeError.
 * A10 Sur le jeu ZZ, les gabarits qui interpolent un « numéro » reçoivent une
 *     URL et produisent « le https://… répond 24h/24 ».
 * A11 `formatCrisisContacts` avec une conjonction non passée rend « or » dans
 *     une phrase française (mélange de langues sur le chemin de crise).
 * A12 `parseCrisisResourceKind` accepte un jeton accentué/localisé par sa
 *     normalisation (`urgence`, `suicidé`) et sert donc de mauvaises lignes.
 */
import {
  CRISIS_RESOURCE_KINDS,
  formatCrisisContacts,
  parseCrisisResourceKind,
  resolveCrisisResources,
  resolveSafetyResourceNumbers,
} from "../supabase/functions/_shared/keel/crisis_resources.ts";
import { safetyCrisisDeterministicVisibleMessage } from "../supabase/functions/sophia-brain/skills/safety_crisis/visible_agent.ts";

const findings: any[] = [];
function record(id: string, verdict: string, detail: unknown) {
  findings.push({ id, verdict, detail });
  console.log(`\n[${id}] ${verdict}`);
  console.log("   ", typeof detail === "string" ? detail : JSON.stringify(detail));
}

// ── A1 — le repli fait-il de l'I/O ? Audit STATIQUE du graphe atteignable ──
const files = [
  "../supabase/functions/sophia-brain/skills/safety_crisis/visible_agent.ts",
  "../supabase/functions/_shared/keel/crisis_resources.ts",
];
const io: any[] = [];
for (const f of files) {
  const src = await Deno.readTextFile(new URL(f, import.meta.url));
  // On isole la portion qui appartient au chemin déterministe.
  const start = src.indexOf("function withCrisisResourceLine") >= 0
    ? src.indexOf("function withCrisisResourceLine")
    : 0;
  const detFrom = src.indexOf("export function safetyCrisisDeterministicVisibleMessage");
  const detTo = src.indexOf("const STAGE_PROMPTS");
  const slice = detFrom >= 0 && detTo > detFrom
    ? src.slice(Math.min(start, detFrom), detTo)
    : src.slice(0, src.indexOf("// Database-backed variant") >= 0
      ? src.indexOf("// Database-backed variant")
      : src.length);
  for (const pat of ["await ", "fetch(", ".from(", "async function"]) {
    const n = slice.split(pat).length - 1;
    if (n > 0) io.push({ file: f.split("/").pop(), pattern: pat, count: n });
  }
}
record(
  "A1",
  io.length === 0 ? "RÉFUTÉE — aucune I/O sur le chemin déterministe" : "À LIRE",
  io,
);

// Mesure: 200 replis d'affilée, temps total. Une I/O se verrait.
const t0 = performance.now();
for (let i = 0; i < 200; i++) {
  safetyCrisisDeterministicVisibleMessage(
    "safety_escalation",
    resolveSafetyResourceNumbers(i % 2 ? "FR" : "US", { conjunction: "ou" }),
  );
}
record("A1-bis", "MESURE", `200 replis en ${(performance.now() - t0).toFixed(1)} ms`);

// ── A3 / A12 — jetons traduits ou inventés ────────────────────────────────
const badKinds = [
  "urgence", "suicidé", "suicide_prevention", "emergencies", "EMERGENCY ",
  "eating disorder", "Eating-Disorder", "poisons", "", null, undefined, 42,
];
const kindResults = badKinds.map((k) => {
  try {
    return { input: String(k), result: parseCrisisResourceKind(k), threw: false };
  } catch (e) {
    return { input: String(k), threw: true, message: String(e).slice(0, 60) };
  }
});
record("A3/A12", "MESURE", kindResults);

// Tous les appels du chemin de crise passent-ils un LITTÉRAL ?
const brainSrc = await Deno.readTextFile(
  new URL("../supabase/functions/_shared/keel/crisis_resources.ts", import.meta.url),
);
const literalCalls = [...brainSrc.matchAll(/resolveCrisisResources\((.*?)\)/g)]
  .map((m) => m[1]);
record("A3-bis", "MESURE — arguments de resolveCrisisResources dans le module", literalCalls);

// ── A5 — le repli du repli est-il atteignable ? ───────────────────────────
const emptyCombos: any[] = [];
for (const country of [...["US", "GB", "FR", "ZZ", "DE", null, "", "xx"]]) {
  const n = resolveSafetyResourceNumbers(country, { conjunction: "ou" });
  if (!n.emergency_numbers || !n.suicide_prevention_number) {
    emptyCombos.push({ country, n });
  }
}
record(
  "A5",
  emptyCombos.length === 0
    ? "CONFIRMÉE — le résolveur ne rend JAMAIS de chaîne vide, donc le repli du repli est mort (inoffensif)"
    : "ATTEINGNABLE",
  emptyCombos,
);

// ── A6 — pays SALE: jamais un voisin ──────────────────────────────────────
const dirty = [
  "gb", " GB ", "Gb", "United Kingdom", "FRA", "fr-FR", "XX", "ZZ", "US ",
  "usa", "uk", "  ", "0", "F", "FRANCE", "🇫🇷",
];
const dirtyRows = dirty.map((raw) => {
  const n = resolveSafetyResourceNumbers(raw, { conjunction: "ou" });
  return {
    input: JSON.stringify(raw),
    served_country: n.country,
    emergency: n.emergency_numbers,
    suicide: n.suicide_prevention_number,
    fallback_used: n.fallback_used,
  };
});
// Un voisin = un numéro national servi pour une entrée qui ne le désigne pas.
const NATIONAL = ["3114", "988", "116 123", "911", "999", "15 ou 112"];
const leaks = dirtyRows.filter((r) =>
  r.fallback_used === false &&
  !["US", "GB", "FR"].includes(r.served_country)
);
const suspicious = dirtyRows.filter((r) =>
  NATIONAL.includes(r.suicide) &&
  !/^(gb|GB| GB |Gb|uk|us|usa|US |fr-FR|FRANCE|F)$/i.test(r.input.replace(/"/g, ""))
);
record(
  "A6",
  leaks.length === 0 ? "RÉFUTÉE — aucune fuite de pays" : "CONFIRMÉE",
  { rows: dirtyRows, leaks, suspicious_to_read: suspicious },
);

// ── A9 — un `kind` inconnu ────────────────────────────────────────────────
let a9: any;
try {
  const msg = safetyCrisisDeterministicVisibleMessage(
    "kind_qui_nexiste_pas" as never,
    resolveSafetyResourceNumbers("FR", { conjunction: "ou" }),
  );
  a9 = { threw: false, message: msg, empty: msg.trim().length === 0 };
} catch (e) {
  a9 = { threw: true, message: String(e).slice(0, 120) };
}
record(
  "A9",
  a9.threw
    ? "CONFIRMÉE — throw dans le gestionnaire de panne (§3 violé)"
    : a9.empty
    ? "CONFIRMÉE — tour vide (R5 violé)"
    : "RÉFUTÉE — message non vide, sans throw",
  a9,
);

// ── A10 — l'URL rendue comme un numéro sur le jeu ZZ ──────────────────────
const zz = resolveSafetyResourceNumbers(null, { conjunction: "ou" });
const zzMessages = (["stop_or_cancel", "safety_escalation", "acute_grounding"] as const)
  .map((kind) => ({
    kind,
    message: safetyCrisisDeterministicVisibleMessage(kind, zz),
  }));
const urlAsNumber = zzMessages.filter((m) => /le https?:\/\//.test(m.message));
record(
  "A10",
  urlAsNumber.length > 0
    ? "CONFIRMÉE — un gabarit interpole une URL comme un numéro à appeler"
    : "RÉFUTÉE",
  zzMessages,
);

// ── A11 — conjonction par défaut « or » dans une phrase française ──────────
const defaultConj = resolveSafetyResourceNumbers("FR");
record(
  "A11",
  defaultConj.emergency_numbers.includes(" or ")
    ? "CONFIRMÉE au niveau du résolveur (défaut anglais)"
    : "RÉFUTÉE",
  {
    defaut: defaultConj.emergency_numbers,
    ce_que_le_reducer_passe: resolveSafetyResourceNumbers("FR", {
      conjunction: "ou",
    }).emergency_numbers,
    format_sans_conjonction: formatCrisisContacts(
      resolveCrisisResources("FR", "emergency"),
    ),
  },
);

// ── Couverture: chaque kind × chaque pays porte une ressource (post-correctif)
const kinds = [
  "immediate_risk_check", "acute_grounding", "support_contact", "stabilizing",
  "exit_check", "resolved_exit", "repeat_current_step", "product_tool_boundary",
  "stop_or_cancel", "safety_transition", "safety_escalation",
] as const;
const naked: any[] = [];
for (const country of ["US", "GB", "FR", "DE", null]) {
  const n = resolveSafetyResourceNumbers(country, { conjunction: "ou" });
  for (const kind of kinds) {
    const m = safetyCrisisDeterministicVisibleMessage(kind, n);
    if (
      !m.includes(n.emergency_numbers) && !m.includes(n.suicide_prevention_number)
    ) naked.push({ country, kind, m });
  }
}
record(
  "COUVERTURE §8",
  naked.length === 0
    ? "TENUE — 55 combinaisons kind × pays, toutes porteuses d'une ressource"
    : `${naked.length} combinaisons NUES`,
  naked.slice(0, 6),
);

record("KINDS", "registre", CRISIS_RESOURCE_KINDS);

await Deno.writeTextFile(
  new URL("./ff020_adversarial_results.json", import.meta.url),
  JSON.stringify(findings, null, 2),
);
