import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1.0.0";

import {
  decideWeighIn,
  parseWeighInToken,
  WEIGH_IN_INTERVAL_DAYS,
  WEIGH_IN_TOKEN_PREFIX,
  WEIGH_IN_WINDOW_END_HOUR,
  WEIGH_IN_WINDOW_START_HOUR,
  weighInToken,
} from "./weigh_in.ts";
import { GOAL_TOKENS } from "./tokens.ts";

/**
 * FF-062 C2 — LE RAPPEL DE PESÉE.
 *
 * ══ CE QUE CES ÉPREUVES TIENNENT ═════════════════════════════════════════
 *
 * · les DEUX horloges: la cadence se compte depuis la dernière PESÉE **et**
 *   depuis la dernière DEMANDE. Sans la seconde, cinq jours de silence font
 *   cinq questions — ce que R2 interdit;
 * · le plancher TCA (R7) et le mute ferment AVANT tout le reste;
 * · un objectif illisible se comporte comme « pas d'objectif »: on se tait;
 * · la fenêtre ne croise aucun autre canal;
 * · le jeton est DISJOINT de celui du point du dimanche, dans les deux sens —
 *   les deux commencent par `KEEL_WE`, et c'est le seul piège de forme ici.
 */

const TODAY = "2026-03-10";

function base(over: Partial<Parameters<typeof decideWeighIn>[0]> = {}) {
  return decideWeighIn({
    goal: "fat_loss",
    restrictionFlag: false,
    muted: false,
    localHour: 17,
    today: TODAY,
    lastMeasuredOn: "2026-03-05",
    lastKg: 78.4,
    lastAskedOn: null,
    ...over,
  });
}

// ---------------------------------------------------------------------------
// LE JETON
// ---------------------------------------------------------------------------

Deno.test("⛔ LE JETON DE PESÉE ET CELUI DU DIMANCHE SONT DISJOINTS", () => {
  // Les deux commencent par `KEEL_WE`. Un lecteur écrit avec `startsWith`
  // confondrait les deux formulaires: le point du dimanche écrirait une pesée,
  // ou l'inverse. Les deux reconnaissances sont ancrées et complètes.
  assertEquals(weighInToken(TODAY), "KEEL_WEIGHIN_2026-03-10");
  assertEquals(parseWeighInToken("KEEL_WEIGHIN_2026-03-10"), TODAY);
  assertEquals(parseWeighInToken("KEEL_WEEKLY_2026-03-09"), null);
  assertEquals(parseWeighInToken("KEEL_WEIGHIN_2026-03-10-extra"), null);
  assertEquals(parseWeighInToken("KEEL_WEIGHIN_"), null);
  assertEquals(parseWeighInToken(null), null);
  assert(WEIGH_IN_TOKEN_PREFIX.startsWith("KEEL_"));
});

Deno.test("un jeton ne se fabrique pas sur une date illisible", () => {
  // Il JETTE plutôt que de rendre `KEEL_WEIGHIN_undefined`: un jeton qui ne se
  // reparse pas produit un formulaire que le serveur refusera, après que
  // l'élève l'a rempli.
  assertThrows(() => weighInToken("10/03/2026"));
  assertThrows(() => weighInToken(""));
});

// ---------------------------------------------------------------------------
// LES PORTES, DANS LEUR ORDRE
// ---------------------------------------------------------------------------

Deno.test("⛔ LE PLANCHER TCA FERME, ET IL FERME AVANT L'OBJECTIF (R7)", () => {
  // Redemander son poids tous les deux jours à quelqu'un sous plancher est
  // exactement le comportement que le plancher existe pour empêcher.
  assertEquals(
    base({ restrictionFlag: true }),
    { ask: false, reason: "restriction_floor" },
  );
  // Et il ferme même quand tout le reste dit oui depuis longtemps.
  assertEquals(
    base({ restrictionFlag: true, lastMeasuredOn: null, goal: "muscle_gain" }),
    { ask: false, reason: "restriction_floor" },
  );
});

Deno.test("le mute coupe ce canal comme les cinq autres", () => {
  assertEquals(base({ muted: true }), { ask: false, reason: "muted" });
});

Deno.test("un objectif illisible se comporte comme PAS d'objectif", () => {
  // Fail-closed (§7): se taire coûte une pesée; parler demande son poids à
  // quelqu'un dont on ne sait rien.
  assertEquals(base({ goal: null }), { ask: false, reason: "no_goal" });
});

Deno.test("la fenêtre est fermée aux deux bouts, et ne croise aucun autre canal", () => {
  assertEquals(
    base({ localHour: WEIGH_IN_WINDOW_START_HOUR - 1 }).ask,
    false,
    "16h: avant la fenêtre",
  );
  assert(base({ localHour: WEIGH_IN_WINDOW_START_HOUR }).ask, "17h: dedans");
  assert(base({ localHour: WEIGH_IN_WINDOW_END_HOUR - 1 }).ask, "18h: dedans");
  assertEquals(
    base({ localHour: WEIGH_IN_WINDOW_END_HOUR }).ask,
    false,
    "19h: la borne haute est EXCLUE — 20h appartient au bilan du jour",
  );
  // ⚠️ LA PROPRIÉTÉ QUI COMPTE, et elle est écrite parce que la coordination
  // par convention de commentaire a déjà produit deux notifications le même
  // soir: la fenêtre de la pesée ne recouvre PAS celle du bilan (20h-22h) ni
  // les heures de C1 (10h, 14h, 21h).
  for (const h of [10, 14, 20, 21, 22]) {
    assertEquals(base({ localHour: h }).ask, false, `${h}h appartient à un autre canal`);
  }
  // Une heure absurde ne fabrique pas une fenêtre.
  assertEquals(base({ localHour: Number.NaN }).ask, false);
});

// ---------------------------------------------------------------------------
// LES DEUX HORLOGES
// ---------------------------------------------------------------------------

Deno.test("chaque objectif a une cadence NOMMÉE — aucune n'hérite d'un défaut", () => {
  // Un quatrième objectif ne compilera pas tant que quelqu'un n'aura pas dit à
  // quelle cadence il se pèse. Cette épreuve garde la même chose à l'exécution.
  for (const goal of GOAL_TOKENS) {
    assert(
      Number.isInteger(WEIGH_IN_INTERVAL_DAYS[goal]) &&
        WEIGH_IN_INTERVAL_DAYS[goal] > 0,
      `${goal} n'a pas de cadence`,
    );
  }
  // ⛔ C'EST LE SEUL ENDROIT DE CE FICHIER QUI FIXE UN NOMBRE. Les tests de
  // comportement, plus bas, DÉRIVENT de la constante: c'est ce qui les rend
  // vrais du BORD (« la cadence ouvre au n-ième jour ») plutôt que d'un
  // chiffre. Sans cette épingle-ci, changer la constante ferait suivre toute la
  // suite en silence — la cicatrice `test-parameterized-by-its-own-constant`.
  //
  // ⟳ 2026-09-08 — la perte passe de 2 à 3 jours (décision produit, demandée
  // telle quelle). Le maintien ne bouge PAS: C2 couvre les trois objectifs.
  assertEquals(WEIGH_IN_INTERVAL_DAYS.fat_loss, 3);
  assertEquals(WEIGH_IN_INTERVAL_DAYS.maintenance, 2);
  assertEquals(
    WEIGH_IN_INTERVAL_DAYS.muscle_gain,
    5,
    "une prise de masse avance 2 à 3× plus lentement. ⟳ Le RAPPORT s'est " +
      "dégradé de 2,5× à 1,67× le 2026-09-08, quand la perte est passée à 3 " +
      "jours: rien n'avait été demandé sur la prise de masse, et déplacer une " +
      "cadence par symétrie arithmétique déciderait à la place de quelqu'un",
  );
});

Deno.test("sous la cadence ça ferme, AU BORD ça ouvre", () => {
  // TODAY = 2026-03-10, cadence de la perte = 3 jours.
  assertEquals(
    base({ lastMeasuredOn: "2026-03-09" }), // 1 jour
    { ask: false, reason: "measured_recently" },
  );
  assertEquals(
    base({ lastMeasuredOn: "2026-03-08" }), // 2 jours — sous la cadence
    { ask: false, reason: "measured_recently" },
  );
  const ok = base({ lastMeasuredOn: "2026-03-07" }); // 3 jours — au bord
  assert(ok.ask);
  if (!ok.ask) return;
  assertEquals(ok.sinceDays, 3);
  // ⚠️ DÉRIVÉ, ET C'EST VOULU: ce test dit « l'intervalle rendu est celui de
  // l'objectif », pas « il vaut 3 ». Le chiffre est épinglé une seule fois,
  // dans le test des cadences nommées.
  assertEquals(ok.intervalDays, WEIGH_IN_INTERVAL_DAYS.fat_loss);
});

Deno.test("une PRISE DE MASSE attend cinq jours, pas deux", () => {
  assertEquals(
    base({ goal: "muscle_gain", lastMeasuredOn: "2026-03-08" }),
    { ask: false, reason: "measured_recently" },
  );
  assert(base({ goal: "muscle_gain", lastMeasuredOn: "2026-03-05" }).ask);
});

Deno.test("AUCUNE pesée du tout ⇒ on demande", () => {
  // Une série sans premier point est le cas où la ceinture de restriction n'a
  // rien à quoi comparer le second. Ce n'est pas « trop récent ».
  const v = base({ lastMeasuredOn: null, lastKg: null });
  assert(v.ask);
  if (!v.ask) return;
  assertEquals(v.sinceDays, null);
  assertEquals(v.lastKg, null);
});

Deno.test("⛔ UNE QUESTION IGNORÉE NE SE RÉPÈTE PAS LE LENDEMAIN (R2)", () => {
  // LE DÉFAUT EXACT QUE LA SECONDE HORLOGE FERME. Sans elle: la personne
  // n'ayant pas répondu ne s'est pas pesée, donc l'écart grandit, donc la
  // question repart chaque jour. Cinq jours de silence = cinq questions, et
  // l'élève apprend que se taire déclenche un ping.
  assertEquals(
    base({ lastMeasuredOn: "2026-03-01", lastAskedOn: "2026-03-09" }),
    { ask: false, reason: "asked_recently" },
  );
  // Deux jours plus tard, la boucle se réamorce d'elle-même.
  // ⚠️ LA RÉCENCE DE LA DEMANDE LIT LE MÊME INTERVALLE que celle de la pesée.
  // À 2 jours elle ferme donc aussi depuis que la perte est à 3.
  assertEquals(
    base({ lastMeasuredOn: "2026-03-01", lastAskedOn: "2026-03-08" }),
    { ask: false, reason: "asked_recently" },
  );
  assert(base({ lastMeasuredOn: "2026-03-01", lastAskedOn: "2026-03-07" }).ask);
});

Deno.test("une date illisible ne vaut pas « jamais »", () => {
  // « On ne sait pas » et « il n'y en a jamais eu » ne doivent pas produire le
  // même comportement: le second demande, le premier se tait.
  assertEquals(
    base({ lastMeasuredOn: "hier" }),
    { ask: false, reason: "measured_recently" },
  );
  assertEquals(
    base({ lastMeasuredOn: "2026-03-01", lastAskedOn: "jamais" }),
    { ask: false, reason: "asked_recently" },
  );
});

// ---------------------------------------------------------------------------
// R8 — LE PLACEHOLDER
// ---------------------------------------------------------------------------

Deno.test("le dernier poids remonte pour le PLACEHOLDER, et jamais un zéro", () => {
  const v = base();
  assert(v.ask);
  if (!v.ask) return;
  assertEquals(v.lastKg, 78.4);
  // `Number(null)` vaut 0: un placeholder « 0 kg » est pire qu'un placeholder
  // absent. Même mode d'échec que `finiteEnergyNumber`, l'absence devenue une
  // valeur.
  for (const bad of [null, 0, -3, Number.NaN]) {
    const w = base({ lastKg: bad as number | null });
    assert(w.ask);
    if (!w.ask) return;
    assertEquals(w.lastKg, null, `lastKg=${bad}`);
  }
});
