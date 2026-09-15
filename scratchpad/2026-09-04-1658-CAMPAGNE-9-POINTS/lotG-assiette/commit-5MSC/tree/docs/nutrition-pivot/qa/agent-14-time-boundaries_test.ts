/**
 * AGENT 14 — famille B : temps (frontière de jour, DST, ancrage minuit/UTC).
 *
 * Les fonctions RÉELLES sont importées (weekStartOf, localHourFor).
 * Les trois helpers privés des edge functions sont RÉPLIQUÉS À L'IDENTIQUE et
 * marqués comme tels — s'ils divergent un jour, ce test ne le verra pas, et
 * c'est dit plutôt que caché.
 */
import { assertEquals } from "jsr:@std/assert@1";
import { weekStartOf } from "../../../supabase/functions/_shared/keel/weekly_flow_io.ts";
import { localHourFor } from "../../../supabase/functions/_shared/keel/reengagement_io.ts";

// ── RÉPLIQUES VERBATIM ────────────────────────────────────────────────────
// keel-daily-pulse-v1/index.ts:49-54, keel-weekly-flow-v1/index.ts:87-93
function localDateFor(now: Date, tz: string | null): string {
  const zone = String(tz ?? "").trim();
  if (!zone) return now.toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
// keel-weekly-flow-v1/index.ts — localDowFor, 0 = dimanche
function localDowFor(now: Date, tz: string | null): number {
  const zone = String(tz ?? "").trim();
  const d = zone
    ? new Date(new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(now) + "T00:00:00Z")
    : new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  return d.getUTCDay();
}

const D = (s: string) => new Date(s);

// ═══════════════════════════════════════════════════════════════════════════
// B4a — FRONTIÈRE DE JOUR : Tokyo 23h55 vs Paris 16h55
// ═══════════════════════════════════════════════════════════════════════════
Deno.test("B4a frontiere de jour Tokyo/Paris — juste des deux cotes", () => {
  // 2026-08-03 14:55Z : Tokyo 23:55 (le 3), Paris 16:55 (le 3)
  const avant = D("2026-08-03T14:55:00Z");
  assertEquals(localHourFor(avant, "Asia/Tokyo"), 23);
  assertEquals(localHourFor(avant, "Europe/Paris"), 16);
  assertEquals(localDateFor(avant, "Asia/Tokyo"), "2026-08-03");
  assertEquals(localDateFor(avant, "Europe/Paris"), "2026-08-03");

  // +10 min : Tokyo a BASCULÉ au 4, Paris est encore le 3.
  const apres = D("2026-08-03T15:05:00Z");
  assertEquals(localHourFor(apres, "Asia/Tokyo"), 0);
  assertEquals(localHourFor(apres, "Europe/Paris"), 17);
  assertEquals(localDateFor(apres, "Asia/Tokyo"), "2026-08-04"); // ← bascule
  assertEquals(localDateFor(apres, "Europe/Paris"), "2026-08-03"); // ← pas encore

  // Le même instant UTC porte donc DEUX dates locales différentes.
  // C'est exactement ce que la clé unique (user_id, local_date) doit voir.
});

Deno.test("B4a frontiere minuit exacte — 15:00:00Z pile", () => {
  const pile = D("2026-08-03T15:00:00Z"); // Tokyo 00:00:00 le 4
  assertEquals(localHourFor(pile, "Asia/Tokyo"), 0);
  assertEquals(localDateFor(pile, "Asia/Tokyo"), "2026-08-04");
  // Une milliseconde avant : encore le 3, 23h59.
  const juste = D("2026-08-03T14:59:59.999Z");
  assertEquals(localDateFor(juste, "Asia/Tokyo"), "2026-08-03");
  assertEquals(localHourFor(juste, "Asia/Tokyo"), 23);
});

Deno.test("B4a fuseaux extremes — Kiritimati +14 / Niue -11", () => {
  // 26 heures d'écart : deux élèves peuvent être à 2 jours de distance.
  const t = D("2026-08-03T12:00:00Z");
  assertEquals(localDateFor(t, "Pacific/Kiritimati"), "2026-08-04"); // +14
  assertEquals(localDateFor(t, "Pacific/Niue"), "2026-08-03"); // -11
  const t2 = D("2026-08-03T23:00:00Z");
  assertEquals(localDateFor(t2, "Pacific/Kiritimati"), "2026-08-04");
  assertEquals(localDateFor(t2, "Pacific/Niue"), "2026-08-03");
});

// ═══════════════════════════════════════════════════════════════════════════
// B4b — weekStartOf rend LE LUNDI pour les 7 jours (piège getUTCDay)
// ═══════════════════════════════════════════════════════════════════════════
Deno.test("B4b weekStartOf rend le LUNDI pour les 7 jours, dimanche compris", () => {
  // Semaine du lundi 2026-07-27 au dimanche 2026-08-02.
  const semaine = [
    ["2026-07-27", "lundi"],
    ["2026-07-28", "mardi"],
    ["2026-07-29", "mercredi"],
    ["2026-07-30", "jeudi"],
    ["2026-07-31", "vendredi"],
    ["2026-08-01", "samedi"],
    ["2026-08-02", "dimanche"], // ← le piège getUTCDay()===0
  ];
  for (const [jour, nom] of semaine) {
    assertEquals(weekStartOf(jour), "2026-07-27", `${nom} ${jour}`);
  }
  // Le lundi suivant ouvre bien une nouvelle semaine.
  assertEquals(weekStartOf("2026-08-03"), "2026-08-03");
});

Deno.test("B4b weekStartOf traverse les bascules de mois et d'annee", () => {
  assertEquals(weekStartOf("2026-01-01"), "2025-12-29"); // jeudi -> lundi de 2025
  assertEquals(weekStartOf("2026-03-01"), "2026-02-23"); // dimanche -> lundi de février
  assertEquals(weekStartOf("2027-01-03"), "2026-12-28"); // dimanche -> lundi de 2026
});

// ═══════════════════════════════════════════════════════════════════════════
// B5 — DST : le dimanche de changement d'heure
//   fenêtre pulse   20h-22h locales, cron horaire à :10  -> attendu 2 ticks
//   fenêtre weekly  18h-21h locales, cron horaire à :40  -> attendu 3 ticks
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Combien de ticks du cron tombent dans la fenêtre, POUR UNE JOURNÉE LOCALE
 * DONNÉE.
 *
 * On balaye ±36h autour du jour local visé et non les 24 heures du jour UTC
 * homonyme: à Santiago (UTC-4) la soirée du 6 septembre local tombe aux heures
 * UTC 23h du 6 ET 00h-01h du 7. Compter par jour UTC mélangeait deux soirées
 * locales et faisait dire n'importe quoi au test — c'était le test qui avait
 * tort, pas le code.
 */
function ticksDansFenetre(
  jourLocal: string,
  tz: string,
  minute: number,
  debut: number,
  fin: number,
): string[] {
  const dedans: string[] = [];
  const pivot = new Date(`${jourLocal}T00:00:00Z`).getTime();
  for (let h = -36; h <= 36; h++) {
    const t = new Date(pivot + h * 3_600_000 + minute * 60_000);
    const lh = localHourFor(t, tz);
    if (lh === null) continue;
    if (localDateFor(t, tz) !== jourLocal) continue;
    if (lh >= debut && lh < fin) dedans.push(t.toISOString());
  }
  return dedans;
}

const JOURS_DST: Array<[string, string, string]> = [
  ["Europe/Paris", "2026-03-29", "recul->avance (23h)"],
  ["Europe/Paris", "2026-10-25", "avance->recul (25h)"],
  ["America/New_York", "2026-03-08", "spring forward"],
  ["America/New_York", "2026-11-01", "fall back"],
  ["Australia/Sydney", "2026-04-05", "fall back sud"],
  ["Australia/Sydney", "2026-10-04", "spring forward sud"],
  ["America/Santiago", "2026-09-06", "Chili — bascule a minuit local"],
  ["America/Havana", "2026-11-01", "Cuba — bascule a 01h local"],
];

Deno.test("B5 pulse 20h-22h : exactement 2 ticks le jour DST, aucun saute, aucun double", () => {
  for (const [tz, jour, note] of JOURS_DST) {
    const t = ticksDansFenetre(jour, tz, 10, 20, 22);
    assertEquals(t.length, 2, `${tz} ${jour} (${note}) -> ticks UTC ${JSON.stringify(t)}`);
  }
});

Deno.test("B5 weekly 18h-21h : exactement 3 ticks le jour DST", () => {
  for (const [tz, jour, note] of JOURS_DST) {
    const t = ticksDansFenetre(jour, tz, 40, 18, 21);
    assertEquals(t.length, 3, `${tz} ${jour} (${note}) -> ticks UTC ${JSON.stringify(t)}`);
  }
});

Deno.test("B5 controle : un jour SANS DST donne les memes comptes", () => {
  for (const tz of ["Europe/Paris", "America/New_York", "Asia/Tokyo"]) {
    assertEquals(ticksDansFenetre("2026-08-03", tz, 10, 20, 22).length, 2, `${tz} pulse`);
    assertEquals(ticksDansFenetre("2026-08-02", tz, 40, 18, 21).length, 3, `${tz} weekly`);
  }
});

Deno.test("B5 l'heure locale n'est jamais ambigue a la bascule (fall back Paris)", () => {
  // 2026-10-25 : 03:00 CEST -> 02:00 CET. 02h est vécue DEUX FOIS en local,
  // mais chaque instant UTC a une réponse unique — c'est ce qui rend le
  // design DST-sûr : on lit l'heure locale D'UN INSTANT, jamais l'inverse.
  assertEquals(localHourFor(D("2026-10-25T00:30:00Z"), "Europe/Paris"), 2); // CEST
  assertEquals(localHourFor(D("2026-10-25T01:30:00Z"), "Europe/Paris"), 2); // CET
  // Deux ticks UTC distincts, la même heure locale 02h. La fenêtre 20-22 n'y
  // touche pas, mais une fenêtre qui contiendrait 02h verrait 2 ticks au lieu
  // d'un — d'où le test de comptage ci-dessus.
});

Deno.test("B5 spring forward : l'heure locale sautee n'existe pour aucun instant", () => {
  // 2026-03-29 : 02:00 -> 03:00. Aucun instant UTC ne rend 02h locale à Paris.
  const heures = new Set<number>();
  for (let m = 0; m < 24 * 60; m++) {
    const t = new Date(D("2026-03-29T00:00:00Z").getTime() + m * 60_000);
    const h = localHourFor(t, "Europe/Paris");
    if (h !== null) heures.add(h);
  }
  assertEquals(heures.has(2), false, "02h locale ne doit exister nulle part ce jour-la");
  assertEquals(heures.has(3), true);
});

// ═══════════════════════════════════════════════════════════════════════════
// B6 — ancrage minuit / UTC : pas de dérive d'un jour
// ═══════════════════════════════════════════════════════════════════════════
Deno.test("B6 weekStartOf est ancre en UTC — insensible au TZ du process", () => {
  // weekStartOf construit `${date}T00:00:00Z` : le Z est l'ancrage. Sans lui,
  // un process en UTC-5 lirait le lundi comme le dimanche précédent.
  const dates = ["2026-08-02", "2026-08-03", "2026-01-01", "2026-12-31"];
  const attendu = dates.map((d) => weekStartOf(d));
  assertEquals(attendu, ["2026-07-27", "2026-08-03", "2025-12-29", "2026-12-28"]);
  // Et le résultat est bien un lundi (getUTCDay()===1) dans tous les cas.
  for (const d of attendu) {
    assertEquals(new Date(`${d}T00:00:00Z`).getUTCDay(), 1, d);
  }
});

Deno.test("B6 localDowFor : 0=dimanche, coherent avec la fenetre weekly", () => {
  // Le job weekly teste `localDow !== 0`. On vérifie sur un vrai dimanche.
  const dimancheSoir = D("2026-08-02T18:30:00Z"); // Paris 20:30 dimanche
  assertEquals(localDowFor(dimancheSoir, "Europe/Paris"), 0);
  const lundiMatin = D("2026-08-03T06:00:00Z");
  assertEquals(localDowFor(lundiMatin, "Europe/Paris"), 1);
});

Deno.test("B6 le dimanche LOCAL peut differer du dimanche UTC", () => {
  // Dimanche 2026-08-02 22:30 UTC = lundi 07:30 à Tokyo.
  const t = D("2026-08-02T22:30:00Z");
  assertEquals(t.getUTCDay(), 0, "dimanche en UTC");
  assertEquals(localDowFor(t, "Asia/Tokyo"), 1, "deja lundi a Tokyo");
  // Un job qui aurait filtré sur getUTCDay() aurait servi Tokyo le mauvais
  // jour. Le job weekly utilise bien le DOW LOCAL — c'est le bon choix.
});

Deno.test("B6 weekStartOf du dimanche local reste la semaine qui se CLOT", () => {
  // Le Flow part le dimanche soir et porte sur la semaine écoulée.
  // Dimanche 2026-08-02 -> semaine du lundi 2026-07-27. Pas du 2026-08-03.
  assertEquals(weekStartOf("2026-08-02"), "2026-07-27");
});
