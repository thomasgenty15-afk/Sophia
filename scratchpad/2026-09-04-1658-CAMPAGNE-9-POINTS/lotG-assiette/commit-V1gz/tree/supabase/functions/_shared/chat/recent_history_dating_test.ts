/**
 * FF-023 — L'HISTORIQUE EST DATÉ, ET LA DATE RÉPOND À LA QUESTION POSÉE.
 *
 * La demande, mot pour mot: « le chat doit obligatoirement avoir un historique
 * daté des messages (que l'agent sache si ça fait 1 h ou 3 jours que les
 * messages sont passés) ».
 *
 * Ce que ces tests gardent, dans l'ordre où ça casse:
 *   1. Un ISO brut NE RÉPOND PAS. Le délai est calculé ici, en déterministe.
 *   2. Le fuseau est celui de la PERSONNE. À 00h10 à Paris, 23h50 c'est hier.
 *   3. Les DEUX langues. Cicatrice `guard-tested-in-one-language-only`.
 *   4. `created_at = null` ⇒ la ligne SORT QUAND MÊME, sans marque inventée.
 *   5. Les deux blocs de prompt qui portent l'historique datent PAREIL — un
 *      seul écrivain, sinon la vérité dépend de qui survit au budget.
 */
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  formatRecentHistoryLine,
  formatRecentHistoryTimeMark,
} from "./recent_history.ts";
import { buildCompanionSystemPrompt } from "../../sophia-brain/agents/companion.ts";
import { formatRecentTurnsLines } from "../../sophia-brain/context/loader.ts";

const NOW = "2026-08-12T10:30:00.000Z";
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function ago(ms: number, base = Date.parse(NOW)) {
  return new Date(base - ms).toISOString();
}

function mark(
  createdAt: string | null,
  opts?: { nowIso?: string; timezone?: string; french?: boolean },
) {
  return formatRecentHistoryTimeMark({
    createdAt,
    nowIso: opts?.nowIso ?? NOW,
    timezone: opts?.timezone ?? "UTC",
    french: opts?.french ?? true,
  });
}

// ── EASY — deux messages à des dates différentes, deux marques distinctes ───

Deno.test("easy/fr: deux dates ⇒ deux marques distinctes et justes", () => {
  const recent = mark(ago(HOUR));
  const vieux = mark(ago(3 * DAY));
  assertEquals(recent, "il y a 1 h · aujourd'hui 09:30");
  assertEquals(vieux, "il y a 3 j · 09/08 10:30");
  assert(recent !== vieux);
});

Deno.test("easy/en: deux dates ⇒ deux marques distinctes et justes", () => {
  const recent = mark(ago(HOUR), { french: false });
  const vieux = mark(ago(3 * DAY), { french: false });
  assertEquals(recent, "1 h ago · today 09:30");
  assertEquals(vieux, "3 d ago · 09/08 10:30");
  assert(recent !== vieux);
});

// ── MEDIUM — 1 h / 3 jours / 3 semaines se distinguent, dans les 2 langues ──

Deno.test("medium: 1 h, 3 jours et 3 semaines ne se lisent pas pareil (fr)", () => {
  assertStringIncludes(String(mark(ago(HOUR))), "il y a 1 h");
  assertStringIncludes(String(mark(ago(3 * DAY))), "il y a 3 j");
  assertStringIncludes(String(mark(ago(21 * DAY))), "il y a 3 sem");
});

Deno.test("medium: 1 h, 3 jours et 3 semaines ne se lisent pas pareil (en)", () => {
  const en = { french: false };
  assertStringIncludes(String(mark(ago(HOUR), en)), "1 h ago");
  assertStringIncludes(String(mark(ago(3 * DAY), en)), "3 d ago");
  assertStringIncludes(String(mark(ago(21 * DAY), en)), "3 w ago");
});

Deno.test("medium: les paliers courts — à l'instant, minutes, heures", () => {
  assertStringIncludes(String(mark(ago(5 * 1000))), "à l'instant");
  assertStringIncludes(String(mark(ago(5 * 1000), { french: false })), "just now");
  assertStringIncludes(String(mark(ago(35 * MIN))), "il y a 35 min");
  assertStringIncludes(String(mark(ago(23 * HOUR))), "il y a 23 h");
  // 23 h 59 est encore « en heures »; 24 h bascule en jours. La frontière est
  // le seul endroit où un modèle pourrait lire « il y a 0 j ».
  assertStringIncludes(String(mark(ago(DAY))), "il y a 1 j");
});

// ── MEDIUM — LE FUSEAU DE LA PERSONNE, DES DEUX CÔTÉS D'UN MINUIT LOCAL ─────

Deno.test("medium: Europe/Paris — 20 min avant, et pourtant HIER", () => {
  // 2026-08-12T22:10Z = 2026-08-13 00:10 à Paris (UTC+2).
  // 2026-08-12T21:50Z = 2026-08-12 23:50 à Paris — la veille EN LOCAL.
  const marque = mark("2026-08-12T21:50:00.000Z", {
    nowIso: "2026-08-12T22:10:00.000Z",
    timezone: "Europe/Paris",
  });
  assertEquals(marque, "il y a 20 min · hier 23:50");
  // La même horloge en UTC ne franchit AUCUN minuit: la preuve que le fuseau
  // change réellement la réponse, et que le test n'aurait rien mesuré sans lui.
  assertEquals(
    mark("2026-08-12T21:50:00.000Z", {
      nowIso: "2026-08-12T22:10:00.000Z",
      timezone: "UTC",
    }),
    "il y a 20 min · aujourd'hui 21:50",
  );
});

Deno.test("medium: décalage NÉGATIF (America/Los_Angeles) — le minuit local aussi", () => {
  // 2026-08-12T07:10Z = 2026-08-12 00:10 à Los Angeles (UTC-7).
  // 2026-08-12T06:50Z = 2026-08-11 23:50 à Los Angeles — la veille EN LOCAL,
  // alors que les deux instants sont le MÊME jour en UTC.
  assertEquals(
    mark("2026-08-12T06:50:00.000Z", {
      nowIso: "2026-08-12T07:10:00.000Z",
      timezone: "America/Los_Angeles",
    }),
    "il y a 20 min · hier 23:50",
  );
  assertEquals(
    mark("2026-08-12T06:50:00.000Z", {
      nowIso: "2026-08-12T07:10:00.000Z",
      timezone: "America/Los_Angeles",
      french: false,
    }),
    "20 min ago · yesterday 23:50",
  );
});

Deno.test("medium: l'heure affichée est l'heure LOCALE, pas l'UTC", () => {
  const paris = mark("2026-08-12T08:05:00.000Z", { timezone: "Europe/Paris" });
  const tokyo = mark("2026-08-12T08:05:00.000Z", { timezone: "Asia/Tokyo" });
  assertStringIncludes(String(paris), "10:05");
  assertStringIncludes(String(tokyo), "17:05");
  // Même instant, même délai: seule l'ancre locale bouge.
  assertStringIncludes(String(paris), "il y a 2 h");
  assertStringIncludes(String(tokyo), "il y a 2 h");
});

Deno.test("medium: un fuseau invalide ne casse pas le tour — le délai tient", () => {
  const marque = mark(ago(2 * HOUR), { timezone: "Mars/Olympus_Mons" });
  assertStringIncludes(String(marque), "il y a 2 h");
});

// ── MEDIUM — PAS DE DATE, PAS DE MARQUE, MAIS LA LIGNE RESTE ───────────────

Deno.test("medium: created_at null ⇒ aucune marque INVENTÉE", () => {
  assertEquals(mark(null), null);
  assertEquals(mark("pas une date"), null);
});

Deno.test("medium: sans horloge de référence, aucune marque inventée non plus", () => {
  assertEquals(mark(ago(HOUR), { nowIso: "" }), null);
  assertEquals(mark(ago(HOUR), { nowIso: "pas une date" }), null);
});

Deno.test("medium: une ligne sans date SORT QUAND MÊME, nue", () => {
  const ligne = formatRecentHistoryLine({
    role: "user",
    content: "mon frère déménage",
    createdAt: null,
    nowIso: NOW,
    timezone: "Europe/Paris",
    french: true,
    roleLabel: "User",
    maxContentChars: 220,
  });
  assertEquals(ligne, "- User: mon frère déménage");
});

Deno.test("medium: un message dans le FUTUR (dérive d'horloge) ne rend pas un délai négatif", () => {
  const marque = mark(ago(-5 * MIN));
  assertStringIncludes(String(marque), "à l'instant");
  assert(!String(marque).includes("-"));
});

// ── LES DEUX BLOCS DE PROMPT, SUR LE VRAI ASSEMBLEUR ───────────────────────

const TEMPORAL_BLOCK = [
  "=== REPÈRES TEMPORELS ===",
  `now_utc=${NOW}`,
  "user_timezone=Europe/Paris",
  "user_locale=fr-FR",
  "",
].join("\n");

function historyForPrompt() {
  return [
    { role: "user", content: "mon frère déménage", created_at: ago(3 * DAY) },
    { role: "assistant", content: "ah, ça bouge", created_at: ago(3 * DAY) },
    { role: "user", content: "et du coup", created_at: ago(HOUR) },
  ];
}

Deno.test("hard/fr: le bloc VISIBLE du composeur porte les marques", () => {
  const prompt = buildCompanionSystemPrompt({
    isWhatsApp: false,
    lastAssistantMessage: "ma dernière réponse",
    history: historyForPrompt(),
    context: TEMPORAL_BLOCK,
    userState: { risk_level: 0 },
    responseLocale: "fr-FR",
  });
  assertStringIncludes(prompt, "HISTORIQUE RECENT VISIBLE");
  assertStringIncludes(prompt, "[il y a 3 j · 09/08 12:30] User: mon frère déménage");
  assertStringIncludes(prompt, "[il y a 1 h · aujourd'hui 11:30] User: et du coup");
  // Le défaut d'origine, nommé: aucune ligne ne sort plus sans marque.
  assert(
    !prompt.includes("- User: mon frère déménage"),
    "la ligne non datée ne doit plus exister",
  );
});

Deno.test("hard/en: le bloc VISIBLE date aussi en anglais", () => {
  const prompt = buildCompanionSystemPrompt({
    isWhatsApp: false,
    lastAssistantMessage: "my last reply",
    history: historyForPrompt(),
    context: TEMPORAL_BLOCK,
    userState: { risk_level: 0 },
    responseLocale: "en-US",
  });
  assertStringIncludes(prompt, "RECENT VISIBLE HISTORY");
  assertStringIncludes(prompt, "[3 d ago · 09/08 12:30] Student: mon frère déménage");
  assertStringIncludes(prompt, "[1 h ago · today 11:30] Student: et du coup");
});

Deno.test("hard: sans REPÈRES TEMPORELS, le bloc visible sort NU — jamais faux", () => {
  const prompt = buildCompanionSystemPrompt({
    isWhatsApp: false,
    lastAssistantMessage: "ma dernière réponse",
    history: historyForPrompt(),
    context: "### COACH DOCTRINE\nprotéine d'abord",
    userState: { risk_level: 0 },
    responseLocale: "fr-FR",
  });
  const bloc = prompt.slice(
    prompt.indexOf("=== HISTORIQUE RECENT VISIBLE ==="),
  );
  assertStringIncludes(bloc, "- User: et du coup");
  assert(!bloc.includes("["), "aucune marque ne doit être inventée");
});

Deno.test("hard: la fenêtre visible reste à 6 — les 6 DERNIERS", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `TOUR${i}`,
    created_at: ago((20 - i) * MIN),
  }));
  const prompt = buildCompanionSystemPrompt({
    isWhatsApp: false,
    lastAssistantMessage: "",
    history,
    context: TEMPORAL_BLOCK,
    userState: { risk_level: 0 },
    responseLocale: "fr-FR",
  });
  const bloc = prompt.slice(prompt.indexOf("=== HISTORIQUE RECENT VISIBLE ==="));
  for (const i of [14, 15, 16, 17, 18, 19]) {
    assertStringIncludes(bloc, `TOUR${i}`);
  }
  assert(!bloc.includes("TOUR13 "), "TOUR13 est hors de la fenêtre de 6");
});

// ── L'AUTRE BLOC: `recentTurns` DU CONTEXT LOADER ─────────────────────────

const USER_TIME = {
  now_utc: NOW,
  user_timezone: "Europe/Paris",
  user_locale: "fr-FR",
};

Deno.test("hard: le bloc du context loader ne sort PLUS d'ISO brut", () => {
  const lignes = formatRecentTurnsLines(historyForPrompt(), 15, USER_TIME);
  assertStringIncludes(lignes, "[il y a 1 h · aujourd'hui 11:30] user: et du coup");
  assertStringIncludes(lignes, "[il y a 3 j · 09/08 12:30] user: mon frère déménage");
  assert(
    !lignes.includes("T10:") && !lignes.includes("Z]"),
    "aucun horodatage ISO ne doit survivre",
  );
});

Deno.test("hard: le bloc du context loader date aussi en anglais", () => {
  const lignes = formatRecentTurnsLines(historyForPrompt(), 15, {
    ...USER_TIME,
    user_locale: "en-US",
  });
  assertStringIncludes(lignes, "[1 h ago · today 11:30] user: et du coup");
  assertStringIncludes(lignes, "[3 d ago · 09/08 12:30] user: mon frère déménage");
});

Deno.test("hard: les DEUX blocs disent la même ancienneté du même message", () => {
  // Le défaut de fond: deux rendus de la même règle ⇒ deux vérités selon
  // celui qui survit au budget de prompt. Un seul écrivain, une seule marque.
  const history = historyForPrompt();
  const lignesLoader = formatRecentTurnsLines(history, 15, USER_TIME);
  const promptCompagnon = buildCompanionSystemPrompt({
    isWhatsApp: false,
    lastAssistantMessage: "",
    history,
    context: TEMPORAL_BLOCK,
    userState: { risk_level: 0 },
    responseLocale: "fr-FR",
  });
  for (const marque of ["il y a 1 h · aujourd'hui 11:30", "il y a 3 j · 09/08 12:30"]) {
    assertStringIncludes(lignesLoader, marque);
    assertStringIncludes(promptCompagnon, marque);
  }
});

Deno.test("hard: sans userTime, le bloc loader sort nu et NE DISPARAÎT PAS", () => {
  const lignes = formatRecentTurnsLines(historyForPrompt(), 15, undefined);
  assertStringIncludes(lignes, "- user: et du coup");
  assertEquals(lignes.split("\n").length, 3);
});

Deno.test("hard: created_at null au loader ⇒ ligne nue, pas ligne perdue", () => {
  const lignes = formatRecentTurnsLines([
    { role: "user", content: "sans date", created_at: null },
    { role: "assistant", content: "avec date", created_at: ago(HOUR) },
  ], 15, USER_TIME);
  assertEquals(lignes.split("\n").length, 2);
  assertStringIncludes(lignes, "- user: sans date");
  assertStringIncludes(lignes, "[il y a 1 h · aujourd'hui 11:30] assistant: avec date");
});

Deno.test("hard: une profondeur de 0 ne rend pas TOUT l'historique", () => {
  assertEquals(formatRecentTurnsLines(historyForPrompt(), 0, USER_TIME), "");
});

// ── LE COÛT EN CARACTÈRES, MESURÉ ─────────────────────────────────────────

Deno.test("le datage coûte moins de 400 caractères sur la fenêtre visible", () => {
  // Le plafond du composeur est de 32 000 caractères et il tronque PAR LA
  // QUEUE: toute matière ajoutée dans le prompt semi-stable (non tronquable)
  // pousse le CONTEXTE vers la falaise. Ce test chiffre la poussée et la
  // borne — s'il casse, c'est que le format de marque a grossi.
  const history = Array.from({ length: 6 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `tour ${i}`,
    created_at: ago((6 - i) * HOUR),
  }));
  const commun = {
    isWhatsApp: false,
    lastAssistantMessage: "",
    history,
    userState: { risk_level: 0 },
    responseLocale: "fr-FR",
  };
  const nu = buildCompanionSystemPrompt({ ...commun, context: "" });
  const date = buildCompanionSystemPrompt({ ...commun, context: TEMPORAL_BLOCK });
  const surcout = date.length - nu.length - TEMPORAL_BLOCK.length;
  assert(
    surcout > 0 && surcout < 400,
    `surcoût du datage attendu dans ]0, 400[ caractères, mesuré ${surcout}`,
  );
});
