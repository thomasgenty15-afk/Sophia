/**
 * FF-010 §10 — LA SEULE MÉTRIQUE DONT LA CIBLE EST ZÉRO, ET QUI SE TESTE.
 *
 * ⚠️ L'INSTRUMENT DEMANDÉ N'EXISTE PAS. La consigne de chantier demandait de
 * prouver l'absence par `turn_summary_logs.context_elements`. Relu en base sur
 * les tours de ce run: `context_tokens` et `context_elements` sont NULL sur
 * TOUTES les lignes — l'écrivain qui les remplirait est mort (cicatrice
 * `turn-summary-context-columns-always-null`), et les blocs KEEL arrivent de
 * toute façon après le chargeur qu'elles mesuraient. Une preuve tirée d'une
 * colonne vide serait une preuve inventée.
 *
 * On prouve donc l'absence là où elle se décide et là où elle se voit:
 *   1. LE CHARGEUR, contre la vraie base: la consigne de l'autre membre n'est
 *      pas dans la structure rendue;
 *   2. LE TEXTE DU BLOC: la chaîne n'y est pas, octet pour octet;
 *   3. TOUT CE QUE L'ÉLÈVE A REÇU: la chaîne n'apparaît dans aucun
 *      `chat_messages` de ce colocataire.
 *
 * usage: deno run -A scratchpad/ff010_leak_proof.ts
 */
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";
import {
  householdContextBlock,
  loadHouseholdTurnContext,
} from "../supabase/functions/_shared/keel/household_turn_context.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ff010_fixture.json", import.meta.url)),
);
const db = admin();
const localDate: string = fixture.today.london;

const SAM_NOTE = "half the starch, double the greens";
const ROB_NOTE = "larger protein and starch share";

const rob = fixture.students.rob.userId;
const sam = fixture.students.sam.userId;

const robCtx = await loadHouseholdTurnContext(db, { userId: rob, localDate });
const samCtx = await loadHouseholdTurnContext(db, { userId: sam, localDate });
if (!robCtx || !samCtx) throw new Error("contexte foyer manquant");

const robBlock = householdContextBlock(robCtx);
const samBlock = householdContextBlock(samCtx);

const { data: robMsgs } = await db.from("chat_messages")
  .select("content").eq("user_id", rob);
const robText = ((robMsgs ?? []) as Array<{ content: string }>)
  .map((m) => m.content ?? "").join("\n");

const results = {
  "1_structure_rob_ne_porte_que_sa_part": robCtx.portions.map((p) => p.firstName),
  "1_structure_sam_ne_porte_que_sa_part": samCtx.portions.map((p) => p.firstName),
  "1_visibilite_croisee": [
    robCtx.roster.map((r) => [r.firstName, r.visibility]),
    samCtx.roster.map((r) => [r.firstName, r.visibility]),
  ],
  "2_bloc_de_rob_contient_la_note_de_sam": robBlock.includes(SAM_NOTE),
  "2_bloc_de_sam_contient_la_note_de_rob": samBlock.includes(ROB_NOTE),
  "2_bloc_de_rob_contient_sa_propre_note": robBlock.includes(ROB_NOTE),
  "3_messages_recus_par_rob_contiennent_la_note_de_sam": robText.includes(SAM_NOTE),
  "3_nombre_de_messages_relus": ((robMsgs ?? []) as unknown[]).length,
};
console.log(JSON.stringify(results, null, 2));

const leaks = [
  results["2_bloc_de_rob_contient_la_note_de_sam"],
  results["2_bloc_de_sam_contient_la_note_de_rob"],
  results["3_messages_recus_par_rob_contiennent_la_note_de_sam"],
];
console.log(leaks.some(Boolean) ? "VERDICT: FUITE (RED)" : "VERDICT: ZÉRO FUITE");
