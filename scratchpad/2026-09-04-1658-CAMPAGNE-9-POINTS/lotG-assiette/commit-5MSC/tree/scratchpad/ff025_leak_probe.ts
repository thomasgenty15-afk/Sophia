/**
 * LA FUITE PAR LE COMPOSEUR — combien de fois le MODÈLE invite-t-il à
 * photographier de son propre chef ?
 *
 * Une invitation qui ne passe pas par le gate ne consomme aucun budget, ne
 * s'inscrit nulle part, et peut donc partir tous les jours: c'est la relance de
 * R2 obtenue en contournant la garde par le haut. Mesuré sur N élèves neufs.
 */
import {
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  turn,
  type Coach,
} from "../docs/nutrition-pivot/qa-web/harness.ts";

const N = Number(Deno.args[0] ?? 6);

const TEMPLATES = [
  "If you have a photo of it, send it over — it helps the tracking.",
  "If you have a photo of it, send it over: even a rough one tells me more than a description, and if you don't, no worries.",
];
/** Une DEMANDE de photo écrite par le modèle, pas un récapitulatif. */
const MODEL_ASK =
  /\b(send|share|snap|take|post|upload)\b[^.?!]{0,40}\b(photo|picture|pic|image|shot)\b|\b(photo|picture|pic|image)\b[^.?!]{0,25}\b(and i'?ll|so i can|if you want)\b/i;

let coach: Coach | null = null;
let seats = 0;
const made: string[] = [];
let leaks = 0;
let armed = 0;

for (let i = 0; i < N; i++) {
  if (!coach || seats >= 3) {
    coach = await makeCoach({ displayName: "FF025 leak", country: "GB" });
    seats = 0;
  }
  seats += 1;
  const s = await makeStudent({
    coach,
    locale: "en-US",
    timezone: "Europe/London",
    fullName: "ff025 leak",
  });
  await publishPlanFor(coach, s.userId, { timezone: "Europe/London" });
  made.push(s.userId);

  // Tour 1: l'invitation du runtime part (budget consommé).
  const t1 = await turn(s, "I ordered a pizza tonight");
  const r1 = String(t1.reply ?? "");
  const hasTemplate = TEMPLATES.some((t) => r1.includes(t));
  if (hasTemplate) armed += 1;
  // On retire la phrase du runtime pour ne juger que la prose du modèle.
  let prose = r1;
  for (const t of TEMPLATES) prose = prose.split(t).join(" ");
  const leak1 = MODEL_ASK.test(prose);

  // Tour 2: budget CONSOMMÉ. Toute demande de photo ici est une pure fuite.
  const t2 = await turn(s, "we ate out at a restaurant, it was heavy");
  let prose2 = String(t2.reply ?? "");
  for (const t of TEMPLATES) prose2 = prose2.split(t).join(" ");
  const leak2 = MODEL_ASK.test(prose2);

  if (leak1 || leak2) {
    leaks += 1;
    console.log(`⚠️  #${i} leak1=${leak1} leak2=${leak2}`);
    if (leak1) console.log(`    T1: ${prose.replace(/\n/g, " ").slice(0, 260)}`);
    if (leak2) console.log(`    T2: ${prose2.replace(/\n/g, " ").slice(0, 260)}`);
  } else {
    console.log(`ok  #${i} armé=${hasTemplate}`);
  }
}

console.log(`\nFUITES: ${leaks}/${N * 2} tours d'élèves (${N} élèves) — invitations armées: ${armed}/${N}`);
for (const u of made) await cleanup(u).catch(() => {});
