/**
 * LE MODULE PUR, eprouve avec MES constantes (pas celles de son test), et
 * nourri des VRAIES lignes du roster.
 */
import {
  parseOwnPlans, planCoversWindow, plansOverlap, resolveHandOff,
  HAND_REASON_COVERS, HAND_REASON_PARTIAL,
} from "../supabase/functions/_shared/keel/household_hand.ts";
import { rpcAs, pass, fail, info, FAILURES } from "./l3h_lib_20260812.ts";

const state = JSON.parse(await Deno.readTextFile(new URL("./l3h_state_20260812.json", import.meta.url)));

// La fenetre du foyer de ce soir: lundi 2026-08-17 -> mercredi 2026-08-19.
const W3 = { startsOn: "2026-08-17", durationDays: 3 };
// La fenetre du mandat: lundi -> dimanche.
const W7 = { startsOn: "2026-08-17", durationDays: 7 };

console.log("== LE MODULE PUR, avec MES cas ==");

const cases: Array<[string, { startsOn: string; durationDays: number }, typeof W3, boolean]> = [
  ["exactement la fenetre", { startsOn: "2026-08-17", durationDays: 3 }, W3, true],
  ["deborde des deux cotes", { startsOn: "2026-08-16", durationDays: 5 }, W3, true],
  ["commence un jour trop tard", { startsOn: "2026-08-18", durationDays: 7 }, W3, false],
  ["finit un jour trop tot", { startsOn: "2026-08-15", durationDays: 4 }, W3, false],
  ["mercredi->dimanche face a lundi->dimanche (le cas du mandat)",
    { startsOn: "2026-08-19", durationDays: 5 }, W7, false],
  ["lundi->dimanche face a lundi->dimanche", { startsOn: "2026-08-17", durationDays: 7 }, W7, true],
];
for (const [label, plan, win, expected] of cases) {
  const got = planCoversWindow(plan, win);
  (got === expected ? pass : fail)(`planCoversWindow: ${label}`, `attendu ${expected}, obtenu ${got}`);
}

// Chevauchement: le cas du mandat MORD sans recouvrir.
(plansOverlap({ startsOn: "2026-08-19", durationDays: 5 }, W7) ? pass : fail)(
  "plansOverlap: mercredi->dimanche MORD sur lundi->dimanche");
(!plansOverlap({ startsOn: "2026-08-25", durationDays: 3 }, W7) ? pass : fail)(
  "plansOverlap: un plan hors fenetre ne mord pas");

// --- resolveHandOff, nourri du VRAI roster (etat courant en base) ---------
const res = await rpcAs(null, "keel_household_roster_for", { p_user: state.owner.userId });
const rows = res.body as any[];
const members = rows.map((r) => ({
  memberId: r.member_id,
  name: r.first_name,
  isOwner: r.role === "owner",
  ownPlans: parseOwnPlans(r.own_plans),
}));
console.log("roster reel:", JSON.stringify(members.map((m) => [m.name, m.isOwner, m.ownPlans.length])));
const off = resolveHandOff({ members, window: W3 });
console.log("composed:", off.composed.map((m) => m.name).join(", "));
console.log("taken:", JSON.stringify(off.taken));
console.log("partial:", JSON.stringify(off.partial));

// --- LE CAS QUE PERSONNE N'A ENCORE MESURE: DEUX PLANS ADJACENTS ---------
// Deux plans personnels vivants et valides qui, ENSEMBLE, couvrent toute la
// fenetre, mais dont AUCUN ne la couvre seul.
const twoPlans = resolveHandOff({
  members: [
    { memberId: "owner", isOwner: true, ownPlans: [] },
    {
      memberId: "second",
      isOwner: false,
      ownPlans: parseOwnPlans([
        { id: "p1", starts_on: "2026-08-17", duration_days: 2, validated_at: "2026-08-12T00:00:00Z" },
        { id: "p2", starts_on: "2026-08-19", duration_days: 1, validated_at: "2026-08-12T00:00:00Z" },
      ]),
    },
  ],
  window: W3,
});
info("DEUX PLANS ADJACENTS couvrant 08-17..08-18 et 08-19",
  `composed=${twoPlans.composed.map((m) => m.memberId).join(",")} taken=${twoPlans.taken.length} partial=${twoPlans.partial.length}`);

// --- fenetre illisible: l'echec est OUVERT -------------------------------
const bad = resolveHandOff({
  members: [{ memberId: "second", isOwner: false, ownPlans: parseOwnPlans([
    { id: "p", starts_on: "2026-08-01", duration_days: 30, validated_at: "2026-08-12T00:00:00Z" }]) }],
  window: { startsOn: "pas-une-date", durationDays: 3 },
});
(bad.composed.length === 1 && bad.taken.length === 0 ? pass : fail)(
  "fenetre illisible: personne n'est retire", JSON.stringify(bad.taken));

console.log(`motifs: ${HAND_REASON_COVERS} / ${HAND_REASON_PARTIAL}`);
console.log(FAILURES.length === 0 ? "MODULE: TOUT PASSE" : `MODULE ECHECS: ${FAILURES.join(" | ")}`);
