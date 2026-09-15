// JETABLE — sonde du vérificateur 1B. Ne fait AUCUNE écriture.
// Attaque la recopie du lundi ISO sur 100 ans, les bords d'année, les
// bissextiles, les semaines ISO 53, et les fuseaux à DST.
import {
  isoMondayOf,
  nextPlanLifeOf,
} from "../supabase/functions/_shared/keel/retained_next_plan.ts";
import { weekStartOf } from "../supabase/functions/_shared/keel/weekly_flow_io.ts";

const DAY = 86_400_000;

function sweep(from: string, to: string) {
  let n = 0;
  const diverge: string[] = [];
  const badLife: string[] = [];
  for (
    let t = Date.parse(`${from}T00:00:00Z`);
    t <= Date.parse(`${to}T00:00:00Z`);
    t += DAY
  ) {
    const day = new Date(t).toISOString().slice(0, 10);
    n++;
    const mine = isoMondayOf(day);
    const theirs = weekStartOf(day);
    if (mine !== theirs) diverge.push(`${day}: ${mine} != ${theirs}`);
    const life = nextPlanLifeOf(day);
    if (!life) {
      badLife.push(`${day}: life=null`);
      continue;
    }
    // Les trois dates doivent être adjacentes PAR CONSTRUCTION.
    const span = (Date.parse(`${life.lastDay}T00:00:00Z`) -
      Date.parse(`${life.anchor}T00:00:00Z`)) / DAY;
    const gap = (Date.parse(`${life.expiredFrom}T00:00:00Z`) -
      Date.parse(`${life.lastDay}T00:00:00Z`)) / DAY;
    if (span !== 6 || gap !== 1) {
      badLife.push(`${day}: span=${span} gap=${gap} ${JSON.stringify(life)}`);
    }
    // L'ancre doit être un lundi.
    if (new Date(`${life.anchor}T00:00:00Z`).getUTCDay() !== 1) {
      badLife.push(`${day}: ancre ${life.anchor} n'est pas un lundi`);
    }
  }
  console.log(
    `sweep ${from}→${to} · ${n} jours · TZ=${
      Deno.env.get("TZ") ?? "(defaut)"
    } · divergences=${diverge.length} · vies cassées=${badLife.length}`,
  );
  for (const d of diverge.slice(0, 10)) console.log("  DIVERGE", d);
  for (const d of badLife.slice(0, 10)) console.log("  VIE", d);
}

sweep("1970-01-01", "2070-12-31");

// Les bords nommés : ISO 53, 1er/31 décembre, 29 février, changements d'heure.
const NAMED = [
  "2015-12-31", "2016-01-01", "2016-01-03", "2016-01-04", // 2015 = 53 semaines
  "2020-12-28", "2020-12-31", "2021-01-01", "2021-01-03",
  "2026-01-01", "2026-12-28", "2026-12-31", "2027-01-01", "2027-01-03",
  "2020-02-29", "2024-02-29", "2028-02-29", "2000-02-29", "2400-02-29",
  "2026-03-29", "2026-10-25", // DST Europe
  "2026-03-08", "2026-11-01", // DST US
  "2026-09-27", // DST Chili / Lord Howe
];
console.log("--- bords nommés ---");
for (const d of NAMED) {
  const mine = isoMondayOf(d);
  const theirs = weekStartOf(d);
  console.log(
    `${d} → ${mine} ${mine === theirs ? "==" : "!= " + theirs} ${
      JSON.stringify(nextPlanLifeOf(d))
    }`,
  );
}

console.log("--- années extrêmes (accepte-t-il ce qu'il ne sait pas calculer ?) ---");
for (const d of ["0001-01-01", "0000-01-03", "9999-12-27", "9999-12-31"]) {
  console.log(
    `${d} → isoMondayOf=${JSON.stringify(isoMondayOf(d))} life=${
      JSON.stringify(nextPlanLifeOf(d))
    }`,
  );
}
