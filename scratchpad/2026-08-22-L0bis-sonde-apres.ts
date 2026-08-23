// L0bis — MESURE APRÈS, exécutée. Lecture seule, zéro génération, zéro écriture.
//
// ⛔ Les modules sont IMPORTÉS, jamais recopiés: le compteur, le plancher de
// maladie et les deux chaînes de dimensionnement sont ceux de la production.
const B = new URL("../supabase/functions/_shared/keel/", import.meta.url).href;
const D = new URL("./2026-08-22-L0bis-corpus/", import.meta.url);

const {
  conditionGatePopulationOf,
  newConditionGateCounter,
  CONDITION_GATE_POPULATIONS,
} = await import(B + "condition_energy_gate.ts");
const { detectDeclaredMedicalCondition } = await import(B + "medical_condition_floor.ts");
const { mouthTargetFactor } = await import(B + "household_portions.ts");
const { mouthTargetKcal } = await import(B + "mouth_anchor.ts");

const read = async (f: string) =>
  JSON.parse(await Deno.readTextFile(new URL(f, D))) as Array<Record<string, unknown>>;

const members = await read("members.json");
const constraints = await read("constraints.json");
const messages = await read("user_messages.json");
const line = (s = "") => console.log(s);

line("══ ① LE COMPTEUR SUR LE CORPUS RÉEL — les bouches de foyer ══");
const refsByUser = new Map<string, string[]>();
for (const c of constraints) {
  const ref = String(c.condition_ref ?? "").trim();
  if (ref === "" || String(c.status) !== "active") continue;
  const uid = String(c.user_id);
  refsByUser.set(uid, [...(refsByUser.get(uid) ?? []), ref]);
}
const counter = newConditionGateCounter();
let sansCompte = 0;
for (const m of members) {
  const uid = m.user_id === null ? null : String(m.user_id);
  if (uid === null) sansCompte++;
  const refs = uid === null ? [] : (refsByUser.get(uid) ?? []);
  counter[conditionGatePopulationOf(refs)]++;
}
line(`  bouches de foyer                 = ${members.length}`);
line(`  dont SANS COMPTE (donc refs = []) = ${sansCompte}`);
line(`  lignes condition_ref actives      = ${[...refsByUser.values()].flat().length}`);
line(`  condition_gate                    = ${JSON.stringify(counter)}`);
line(`  populations rendues               = ${Object.keys(counter).length} ` +
  `(${CONDITION_GATE_POPULATIONS.join(", ")})`);
const total = Object.values(counter).reduce((a: number, b) => a + (b as number), 0);
line(`  none majoritaire ?                = ${counter.none} / ${total} = ` +
  `${((counter.none / total) * 100).toFixed(1)} %`);

line();
line("══ ② LE CHEMIN RÉEL — rejeu du plancher sur les messages ARCHIVÉS ══");
// ⚠️ Le chat est le SEUL écrivain de `condition_ref`. Si le plancher ne mord sur
// aucun message réel, la garde n'a jamais eu d'occasion de tourner en base.
const replay = newConditionGateCounter();
const hits: Array<{ ref: string; matched: string }> = [];
for (const m of messages) {
  const hit = detectDeclaredMedicalCondition(m.content);
  const refs = hit === null ? [] : [String(hit.condition_ref)];
  replay[conditionGatePopulationOf(refs)]++;
  if (hit !== null) hits.push({ ref: String(hit.condition_ref), matched: String(hit.matched) });
}
line(`  messages d'élève archivés = ${messages.length}`);
line(`  condition_gate (rejeu)    = ${JSON.stringify(replay)}`);
const byRef = new Map<string, number>();
for (const h of hits) byRef.set(h.ref, (byRef.get(h.ref) ?? 0) + 1);
line(`  jetons produits           = ${JSON.stringify([...byRef].sort())}`);
line(
  `  none majoritaire ?        = ${replay.none} / ${messages.length} = ` +
    `${((replay.none / messages.length) * 100).toFixed(1)} %`,
);

line();
line("══ ③ LES DEUX CAS, SUR LE CORPS DE LA MESURE AVANT ══");
const HER = {
  heightCm: 165,
  weightKg: 68,
  gender: "female" as const,
  ageYears: 31,
  activityLevel: "sedentary" as const,
  activityAxes: { day: null, sport: null, asked: false },
  appetite: null,
};
const SIZING = {
  ageState: "adult" as const,
  restrictionFlag: false,
  coachCounting: "no_position" as const,
  direction: "down" as const,
  paceKgPerWeek: 0.5,
  conditionRefs: [] as readonly string[],
  subject: { body: HER, isMinor: false },
};
const ANCHOR = (refs: readonly string[]) => ({
  memberId: "m", ageState: "adult" as const, restriction: "clear" as const,
  body: HER, direction: "down" as const, paceKgPerWeek: 0.5,
  declaredSlots: [] as readonly string[], structure: null, conditionRefs: refs,
});
for (const refs of [[], ["pregnancy"], ["breastfeeding"], ["diabetes"], ["hypertension"]]) {
  const f = mouthTargetFactor({ ...SIZING, conditionRefs: refs });
  const a = mouthTargetKcal(ANCHOR(refs), "no_position");
  line(
    `  ${JSON.stringify(refs).padEnd(20)} ⇒ facteur ${f.factor.toFixed(4)} (${f.reason.padEnd(18)})` +
      ` · ancre ${a.kcal === null ? "null" : String(a.kcal).padStart(4)} (${a.reason})`,
  );
}
const nu = JSON.stringify(mouthTargetFactor({ ...SIZING, conditionRefs: [] }));
const autre = JSON.stringify(mouthTargetFactor({ ...SIZING, conditionRefs: ["diabetes"] }));
line(`  byte-identique (aucune condition vs diabetes) : ${nu === autre ? "OUI" : "NON"}`);
