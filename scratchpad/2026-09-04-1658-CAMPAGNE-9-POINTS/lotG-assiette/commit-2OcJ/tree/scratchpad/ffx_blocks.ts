/**
 * PASSE TRANSVERSE ① — LA TAILLE DE CHAQUE BLOC, MESURÉE SUR LA VRAIE DONNÉE.
 *
 * ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
 * Le texte du prompt n'est stocké nulle part. `full_chars` dit la TAILLE du
 * prompt, jamais sa COMPOSITION — donc « quel bloc tombe le premier ? » ne se
 * répond pas avec un A/B d'appartenance: il faut la taille de chaque bloc et
 * l'ordre dans lequel `withKeelDoctrineBlock` les empile.
 *
 * Ici on appelle les MÊMES chargeurs et les MÊMES fabricants de bloc que
 * `run.ts`, sur le MÊME élève, avec la MÊME date locale. Chaque bloc est mesuré
 * individuellement, puis l'empilement est reconstruit dans l'ordre du code, et
 * la position de la coupe est calculée.
 *
 * ── L'ARITHMÉTIQUE DE LA COUPE, ET ELLE EST VÉRIFIABLE ─────────────────────
 * `applyCompanionPromptBudget` coupe à `COMPANION_PROMPT_MAX_CHARS = 32 000`,
 * PAR LA QUEUE, puis `appendResponseLanguageBlock` ajoute son bloc APRÈS le
 * budget. D'où:
 *
 *     full_chars = stable + semi + volatile + 226      (non tronqué, en-US)
 *     full_chars = 32 222                              (tronqué, en-US)
 *
 * Le 226 = 2 (séparateur base/contexte + trim) + 2 + 221 (bloc RESPONSE_
 * LANGUAGE en-US, mesuré). VÉRIFIÉ sur les mesures de FF-023 (tour 01:
 * 10536+583+15497+226 = 26842 = exactement son `full_chars`; tour 05:
 * 10536+2237+17151+226 = 30150, idem). `32 222` est donc la SIGNATURE d'un
 * prompt tronqué, pas une marge.
 *
 * usage: deno run -A scratchpad/ffx_blocks.ts
 */
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";
import {
  doctrineBlockFor,
  loadPublishedDoctrine,
} from "../supabase/functions/_shared/keel/doctrine_loader.ts";
import {
  loadPublishedProtocol,
  protocolChatBlockFor,
} from "../supabase/functions/_shared/keel/protocol_loader.ts";
import { weekReviewPromptBlock } from "../supabase/functions/_shared/keel/week_review.ts";
import { loadLatestWeekReview } from "../supabase/functions/_shared/keel/week_review_io.ts";
import { pulseContextBlock } from "../supabase/functions/_shared/keel/daily_pulse.ts";
import { loadLatestPulse } from "../supabase/functions/_shared/keel/daily_pulse_io.ts";
import {
  groundedSupportBlock,
  supportGround,
} from "../supabase/functions/_shared/keel/grounded_support.ts";
import { loadDayFacts } from "../supabase/functions/_shared/keel/daily_recap_io.ts";
import {
  householdContextBlock,
  loadHouseholdTurnContext,
} from "../supabase/functions/_shared/keel/household_turn_context.ts";
import { loadHungerDays } from "../supabase/functions/_shared/keel/hunger_signal_io.ts";
import {
  countHungerDays,
  satietyPromptBlock,
} from "../supabase/functions/_shared/keel/hunger_signal.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ffx_fixture.json", import.meta.url)),
);
const db = admin();
const userId: string = fixture.student.userId;
const localDate: string = fixture.today;

const doctrine = await loadPublishedDoctrine(db, userId);
const protocol = await loadPublishedProtocol(db, userId);
const household = await loadHouseholdTurnContext(db, { userId, localDate });
const weekReview = await loadLatestWeekReview(db, userId);
const pulse = await loadLatestPulse(db, { userId, localDate });
const dayFacts = await loadDayFacts(db, { userId, localDate });
const ground = supportGround(dayFacts, weekReview?.reading ?? null);
const hungerDays = await loadHungerDays(db, { userId, todayLocalDate: localDate });
const hunger = countHungerDays(hungerDays, localDate);

// L'ORDRE EST CELUI DE `withKeelDoctrineBlock` (run.ts:2210-2400), et c'est
// l'ordre de SURVIE: le budget coupe par la queue, donc le dernier tombe le
// premier. Aucun de ces rangs n'est inventé ici — chacun est commenté dans le
// code comme un classement par coût de perte.
const stack: Array<{ rank: number; fiche: string; name: string; text: string }> = [
  { rank: 1, fiche: "—", name: "verrou clinique (absent hors déclaration)", text: "" },
  {
    rank: 2,
    fiche: "—",
    name: "contraintes dures (allergènes)",
    text: "", // aucune contrainte déclarée sur ce décor
  },
  {
    rank: 3,
    fiche: "PIVOT §3.3",
    name: "DOCTRINE DU COACH",
    text: doctrine ? doctrineBlockFor(doctrine) : "",
  },
  {
    rank: 4,
    fiche: "FF-016",
    name: "protocole (aliments encouragés)",
    text: protocol
      ? protocolChatBlockFor(protocol, doctrine?.coachDisplayName ?? null)
      : "",
  },
  {
    rank: 5,
    fiche: "FF-010",
    name: "foyer (plats, portions, courses)",
    text: household ? householdContextBlock(household) : "",
  },
  { rank: 6, fiche: "—", name: "note 1:1 du coach", text: "" },
  {
    rank: 7,
    fiche: "—",
    name: "bilan hebdo",
    text: weekReview
      ? weekReviewPromptBlock(weekReview.reading, weekReview.biofeedback)
      : "",
  },
  {
    rank: 8,
    fiche: "FF-013",
    name: "pouls du soir",
    text: pulseContextBlock(pulse, Boolean(weekReview?.biofeedback)),
  },
  {
    rank: 9,
    fiche: "FF-011",
    name: "soutien groundé",
    text: groundedSupportBlock(dayFacts, ground),
  },
];

const satiety = satietyPromptBlock(hunger);

console.log("=== L'ÉLÈVE ===");
console.log(`user_id      : ${userId}`);
console.log(`local_date   : ${localDate}`);
console.log(`doctrine     : ${doctrine ? `chargée (${doctrine.reason ?? "?"})` : "ABSENTE"}`);
console.log(`protocole    : ${protocol ? `chargé (${protocol.reason ?? "?"}, ${protocol.compiled?.length ?? 0} règles)` : "ABSENT"}`);
console.log(`foyer        : ${household ? `${household.kind ?? "?"} / visible=${JSON.stringify(household.visible ?? household.reason ?? "?")}` : "ABSENT"}`);
console.log(`bilan hebdo  : ${weekReview ? weekReview.weekStart : "ABSENT"}`);
console.log(`pouls        : ${pulse ? JSON.stringify(pulse) : "aucun"}`);
console.log(
  `day_facts    : ticked=${dayFacts.tickedCount} planned=${dayFacts.plannedCount} ` +
    `photos=${dayFacts.photoCount} offPlan=${dayFacts.offPlanCount} → ground=${ground}`,
);
console.log(
  `faim (FF-027): ${hunger.days} jour(s) dans [${hunger.windowStart}..${hunger.windowEnd}] ` +
    `récurrent=${hunger.recurrent}`,
);
console.log(
  `bloc satiété : ${satiety === null ? "null" : `${satiety.length} car.`} ` +
    `— ⚠️ N'ENTRE PAS dans le prompt du chat (0 occurrence dans sophia-brain)`,
);

console.log("\n=== L'EMPILEMENT (ordre de survie: le DERNIER tombe le PREMIER) ===");
let cumulative = 0;
const offsets: Array<{ rank: number; name: string; start: number; end: number; len: number }> = [];
for (const b of stack) {
  const len = b.text.trim().length;
  if (len === 0) {
    console.log(`  ${b.rank}. ${b.name.padEnd(44)} : absent`);
    continue;
  }
  const start = cumulative;
  cumulative += len + 2; // le "\n\n" de `blocks.join`
  offsets.push({ rank: b.rank, name: b.name, start, end: cumulative, len });
  console.log(
    `  ${b.rank}. ${b.name.padEnd(44)} : ${String(len).padStart(6)} car.  ` +
      `[${start}..${cumulative}]  (${b.fiche})`,
  );
}
console.log(`  TOTAL blocs KEEL${" ".repeat(31)}: ${cumulative} car.`);

await Deno.writeTextFile(
  new URL("./ffx_blocks.json", import.meta.url),
  JSON.stringify(
    {
      userId,
      localDate,
      ground,
      hunger,
      satietyBlockChars: satiety?.length ?? null,
      satietyInChatPrompt: false,
      blocks: offsets,
      keelBlocksTotalChars: cumulative,
    },
    null,
    2,
  ),
);
