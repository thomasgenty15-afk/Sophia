/**
 * LE TEXTE DU PLAN NE DIT QUE CE QUI A EU LIEU — 2026-09-25 (lot 10 du banc des
 * trois foyers).
 *
 * Trois phrases lues par la personne disaient autre chose que le plan :
 *   · « Le budget des courses est X. Pour y tenir… » alors que la consigne,
 *     sous le plancher, n'avait jamais reçu ce budget ;
 *   · rien sur l'énergie pour une personne seule servie sous son enveloppe
 *     (`energyBelowBand: null` en dur, écrit pour une table) ;
 *   · « measured, not applied … scaled back to fit » dans les `issues`, un
 *     calcul que rien n'applique.
 * Ce fichier ne teste QUE la jointure dans la lane du foyer.
 */
import { assert } from "jsr:@std/assert@1";
import { sourceFamilySync } from "./source_family.ts";

const SRC = sourceFamilySync(
  new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
);

Deno.test("TEXTE ① — le budget du texte est celui que la consigne a reçu", () => {
  assert(
    SRC.includes(
      "budgetAmount: budgetReachesPrompt(capacity.budgetAmount, budgetBounds?.floor ?? null)",
    ),
    "le texte lit la même décision que la consigne",
  );
  assert(
    SRC.includes("ceiling_sent: budgetReachesPrompt(capacity.budgetAmount, budgetBounds.floor),"),
    "et le compteur aussi",
  );
});

Deno.test("TEXTE ② — la phrase d'énergie d'une personne seule est posée APRÈS la garde, jamais pour une bouche protégée", () => {
  assert(SRC.includes("energyBelowBand: rationaleEnergyBelow,"), "le fait n'est plus `null` en dur");
  const garde = SRC.indexOf("(writePayload.generated_from as Record<string, unknown>).validation =");
  const pose = SRC.indexOf("rationaleEnergyBelow = true;");
  assert(garde > 0 && pose > garde, "posé après le verdict de la garde");
  const bloc = SRC.slice(garde, pose);
  assert(bloc.includes("composedMembers.length === 1"), "une personne seule");
  // ⛔ `=== false`: un drapeau illisible (`null`) se tait.
  assert(bloc.includes("rationaleSolo.body?.restrictionFlag === false"), "drapeau de restriction lu et baissé");
  assert(bloc.includes('r.cause === "mouth_energy_short" && r.member_id === rationaleSolo.memberId'), "l'écart de CETTE personne");
  const apres = SRC.slice(pose, pose + 600);
  assert(apres.includes("composeRationale(lastRationaleCourses);"), "le texte est recomposé");
  assert(
    apres.includes("(writePayload.generated_from as Record<string, unknown>).rationale = {"),
    "et la ligne écrite le porte",
  );
});

Deno.test("TEXTE ③ — une recomposition garde les phrases de compromis", () => {
  assert(SRC.includes("rationaleLines = [...explained.lines, ...tradeoffLines];"), "la composition les rajoute");
  assert(SRC.includes("tradeoffLines = [...tradeoffs.lines];"), "elles sont retenues à part");
});

Deno.test("TEXTE ④ — le calcul fantôme des boîtes ne va plus dans les `issues`", () => {
  assert(!SRC.includes("measured, not applied:"), "plus aucune ligne « measured, not applied »");
  assert(!SRC.includes("issues.push(...boxSizing.issues"), "les lignes du calcul ne partent plus dans les issues");
  assert(SRC.includes("measured_lines: boxSizing.issues,"), "elles restent au journal");
});
