/**
 * BANC A8.1/A8.2/A8.3 — LE SORT D'UNE PART, CONTRE LA BASE REELLE.
 *
 * ⚠️ POURQUOI CE BANC EXISTE, ET CE QU'IL NE PROUVE PAS. Le chemin nominal du
 * tap est `chat-inbound-v1`, qui exige le JWT DE L'ELEVE (`auth.getUser`). Je
 * n'ai pas le droit d'en forger un ni d'entrer un mot de passe: ce banc appelle
 * donc les MEMES fonctions d'I/O que le routeur, avec le client `service_role`,
 * contre la VRAIE base. Ce qu'il prouve: la lecture du foyer, la derivation des
 * etapes, la porte SQL et ses refus, les lignes ecrites. Ce qu'il NE prouve
 * PAS: le routage du `button_payload` depuis une bulle de chat, ni le rendu.
 */
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import {
  handleShareTap,
  shareStepAfterUntick,
} from "../supabase/functions/_shared/chat/share_outcome_tap.ts";
import { readShareReply } from "../supabase/functions/_shared/keel/share_step.ts";
import { applyStripTicks } from "../supabase/functions/_shared/keel/evening_strip_io.ts";

const URL = "http://127.0.0.1:54321";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL, KEY, { auth: { persistSession: false } });

const MASTER = "9a030000-0000-4000-8000-0000000000a1";
const MEMBER = "9a030000-0000-4000-8000-0000000000a2";
const MOUTH_MEMBER = "9a032222-0000-4000-8000-00000000c0d2";
const MEAL = "9a033333-0000-4000-8000-00000000d001";
const TODAY = new Date().toISOString().slice(0, 10);
/** Le plat COMMUN de jeudi (position 1 dans le `dishes[]` stocke). */
const DISH = 1;

const show = (label: string, v: unknown) =>
  console.log(`\n### ${label}\n${JSON.stringify(v, null, 2)}`);

// ── 1. LE ✗ DU MAITRE — l'etape « qui n'a pas mange » ─────────────────────
const whoStep = await shareStepAfterUntick(admin, {
  userId: MASTER, mealId: MEAL, dishIndex: DISH, language: "fr", localDate: TODAY,
});
show("1. MAITRE ✗ -> etape « qui »", whoStep);

// ── 2. LE ✗ DU MEMBRE — le sort de SA boite ───────────────────────────────
const boxStep = await shareStepAfterUntick(admin, {
  userId: MEMBER, mealId: MEAL, dishIndex: DISH, language: "fr", localDate: TODAY,
});
show("2. MEMBRE ✗ -> sort de SA boite", boxStep);

// ── 3. « Choisir… » chez le maitre — les bouches SANS COMPTE seulement ────
const pickId = whoStep?.buttons.find((b) => b.payload.endsWith("|pick"))?.payload;
const pick = pickId ? readShareReply(pickId) : { kind: "none" as const };
if (pick.kind !== "none") {
  show("3. MAITRE « Choisir… »", await handleShareTap(admin, {
    userId: MASTER, reply: pick, language: "fr", localDate: TODAY,
  }));
}

// ── 4. « Tout le foyer » — rend la main a FF-057 ──────────────────────────
const allId = whoStep?.buttons.find((b) => b.payload.endsWith("|all"))?.payload;
const all = allId ? readShareReply(allId) : { kind: "none" as const };
if (all.kind !== "none") {
  show("4. MAITRE « Tout le foyer »", await handleShareTap(admin, {
    userId: MASTER, reply: all, language: "fr", localDate: TODAY,
  }));
}

// ── 5. LE MEMBRE RANGE SA BOITE — l'ecriture par la porte ────────────────
const keepId = boxStep?.buttons[0]?.payload;
const keep = keepId ? readShareReply(keepId) : { kind: "none" as const };
if (keep.kind !== "none") {
  show("5. MEMBRE range sa boite", await handleShareTap(admin, {
    userId: MEMBER, reply: keep, language: "fr", localDate: TODAY,
  }));
}

// ── 6. ⛔ LE MAITRE ESSAIE DE DECLARER POUR LE CONJOINT ───────────────────
// Une charge FORGEE: le bouton n'existe nulle part a l'ecran. La porte doit
// rendre `not_your_line`, et l'ecran doit deja l'avoir refuse.
const forged = readShareReply(
  `KEEL_SHARE_BOX|${MEAL}|${DISH}|${MOUTH_MEMBER}|discarded|-`,
);
if (forged.kind !== "none") {
  show("6. ⛔ MAITRE declare pour le CONJOINT (charge forgee)",
    await handleShareTap(admin, {
      userId: MASTER, reply: forged, language: "fr", localDate: TODAY,
    }));
}

// ── 7. A8.1 — MAITRE ✓ ET MEMBRE ✗ SUR LE MEME PLAT, LE MEME SOIR ────────
const now = new Date();
show("7a. MAITRE ✓", await applyStripTicks(admin, {
  userId: MASTER, mealId: MEAL, dishIndexes: [DISH],
  disqualified: null, today: TODAY, now,
}));
show("7b. MEMBRE ✗", await applyStripTicks(admin, {
  userId: MEMBER, mealId: MEAL, dishIndexes: [DISH],
  disqualified: "food_not_eaten", today: TODAY, now,
}));
