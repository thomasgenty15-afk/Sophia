/**
 * LA GARDE DU LOT `X1′` — UN POIDS ABERRANT SE REFUSE PARTOUT PAREIL.
 *
 * ── CE QUE CE FICHIER EMPÊCHE, ET C'EST DÉJÀ ARRIVÉ ─────────────────────────
 * Le 2026-08-22, `rg -c '(TARGET_)?WEIGHT_KG_(MIN|MAX)\s*='` sur
 * `_shared/keel/` rendait QUATRE fichiers et HUIT lignes. Trois portaient 400,
 * `student_body_io.ts` portait **350** — et son propre commentaire affirmait
 * qu'il était « aligné sur celles du formulaire hebdo ». Rien ne l'a vu, parce
 * qu'aucun test ne comparait deux fichiers entre eux: chaque côté était vert
 * séparément. C'est le défaut n° 1 de ce dépôt, appliqué à un nombre.
 *
 * ── POURQUOI UNE GARDE ET PAS SEULEMENT UN IMPORT ───────────────────────────
 * L'import ne survit pas à la prochaine session pressée: re-déclarer une
 * constante locale est le geste le plus naturel du monde, il compile, et rien
 * ne le distingue. La garde ① compte les DÉCLARATIONS sur le disque, ② épingle
 * la valeur en littéral, ③ va chercher les quatre copies du front qu'aucun
 * import ne peut atteindre, ④ nomme la seule copie qui reste.
 *
 * ── ⛔ CETTE GARDE EST VERTE SUR L'ARBRE DE TRAVAIL, PAS SUR `HEAD` ──────────
 * Déclaré, pas subi. `student_body_io.ts` et `weight_pace.ts` portaient au
 * moment du lot des modifications NON COMMITÉES d'autres sessions (plomberie
 * `activityAxes` / `appetite` / `declaredWeightKg`). La règle du chantier
 * (§⑨ n° 15) est alors: appliquer dans l'arbre de travail — c'est lui que
 * `functions serve` et la porte exécutent — et NE PAS commiter ces deux
 * fichiers. Leur correctif `X1′` vit donc sur le disque et pas dans l'histoire.
 *
 * Conséquence exacte, pour qu'on ne la redécouvre pas: sur un `checkout` propre
 * du commit de `X1′`, le test ① ci-dessous ROUGIT en nommant ces deux fichiers,
 * et LUI SEUL. Ce n'est pas une régression, c'est le mur des fichiers non
 * commitables. Il se refermera quand la session propriétaire commitera les
 * siens. Précédent journalisé: `V0-A`, dont le `tsc` ne peut pas être vert
 * depuis un checkout propre tant qu'`en.ts`/`fr.ts` sont interdits de commit.
 *
 * ── CE QU'ELLE NE FAIT PAS ──────────────────────────────────────────────────
 * Elle ne lit pas les migrations. Six contraintes `check` et six gardes de RPC
 * portent 25-400, mais une migration est de l'HISTOIRE: la lire au motif
 * qu'elle est la dernière fabrique un test qui rougit le jour où quelqu'un en
 * écrit une autre pour une raison sans rapport. Les numéros sont nommés dans
 * l'en-tête de `weight_bounds.ts`, et c'est le bon endroit.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import { fromFileUrl } from "https://deno.land/std@0.208.0/path/mod.ts";

import { WEIGHT_KG_MAX, WEIGHT_KG_MIN } from "./weight_bounds.ts";
import { BODY_MEASURE_BOUNDS } from "./body_measure_floor.ts";
import {
  WEIGHT_KG_MAX as WEEKLY_MAX,
  WEIGHT_KG_MIN as WEEKLY_MIN,
} from "./weekly_flow.ts";
import {
  TARGET_WEIGHT_KG_MAX as ENERGY_MAX,
  TARGET_WEIGHT_KG_MIN as ENERGY_MIN,
} from "./energy_target.ts";
import {
  TARGET_WEIGHT_KG_MAX as PACE_MAX,
  TARGET_WEIGHT_KG_MIN as PACE_MIN,
} from "./weight_pace.ts";

const KEEL_DIR = fromFileUrl(new URL(".", import.meta.url));
const REPO = fromFileUrl(new URL("../../../../", import.meta.url));

/** La forme d'une DÉCLARATION, pas d'un usage ni d'une ré-exportation. */
const DECLARATION = /(?:^|\s)(?:TARGET_)?WEIGHT_KG_(?:MIN|MAX)\s*=/;

function readRepo(relative: string): string {
  return Deno.readTextFileSync(REPO + relative);
}

/**
 * Les lignes de code EXÉCUTÉ d'un fichier, commentaires retirés.
 *
 * ⚠️ Sans ce filtre, la garde compterait les commentaires comme des porteurs
 * vivants — et ce module en écrit exprès plusieurs (« portait 350 », « 25 /
 * 400 ») pour raconter la divergence. Une garde qui rougit sur sa propre
 * documentation est une garde qu'on désarme au premier faux positif.
 */
function executedLines(source: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of source.split("\n")) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end < 0) continue;
      line = line.slice(end + 2);
      inBlock = false;
    }
    for (;;) {
      const open = line.indexOf("/*");
      if (open < 0) break;
      const close = line.indexOf("*/", open + 2);
      if (close < 0) {
        line = line.slice(0, open);
        inBlock = true;
        break;
      }
      line = line.slice(0, open) + line.slice(close + 2);
    }
    const slash = line.indexOf("//");
    if (slash >= 0) line = line.slice(0, slash);
    if (line.trim()) out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ① UNE SEULE DÉCLARATION DANS TOUT `_shared/keel/`
// ---------------------------------------------------------------------------

Deno.test("X1′ — un seul module du back DÉCLARE les bornes de poids", () => {
  const carriers: string[] = [];
  for (const entry of Deno.readDirSync(KEEL_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith("_test.ts")) continue;
    const source = Deno.readTextFileSync(KEEL_DIR + entry.name);
    if (executedLines(source).some((l) => DECLARATION.test(l))) {
      carriers.push(entry.name);
    }
  }
  assertEquals(
    carriers.sort(),
    ["weight_bounds.ts"],
    "Le refus d'un poids aberrant vient de RE-diverger. Avant `X1′` il était " +
      "déclaré dans weekly_flow.ts, energy_target.ts, weight_pace.ts et " +
      "student_body_io.ts — et ce dernier portait déjà 350 au lieu de 400. " +
      "Importe `weight_bounds.ts` au lieu de re-déclarer. ⚠️ Si les deux " +
      "fichiers nommés sont `student_body_io.ts` et `weight_pace.ts`, lis " +
      "l'en-tête: leur correctif vit dans l'arbre de travail et pas dans " +
      "`HEAD` (§⑨ n° 15), et ce rouge-là est attendu sur un checkout propre.",
  );
});

// ---------------------------------------------------------------------------
// ② LA VALEUR, ÉPINGLÉE EN LITTÉRAL
// ---------------------------------------------------------------------------

Deno.test("X1′ — la valeur tranchée est 25 / 400, et elle est épinglée", () => {
  // Épinglage littéral: un test qui écrirait `assertEquals(WEIGHT_KG_MAX,
  // WEIGHT_KG_MAX)` resterait vert quelle que soit la valeur. Décision §⑥ n° 25
  // du plan du 2026-08-21.
  assertEquals(WEIGHT_KG_MIN, 25);
  assertEquals(WEIGHT_KG_MAX, 400);
});

Deno.test("X1′ — les trois noms publics du back rendent le MÊME refus", () => {
  // Les alias historiques survivent (`TARGET_` chez la cible, nu chez la
  // pesée): ce lot ne renomme rien, il retire la copie.
  assertEquals([WEEKLY_MIN, WEEKLY_MAX], [WEIGHT_KG_MIN, WEIGHT_KG_MAX]);
  assertEquals([ENERGY_MIN, ENERGY_MAX], [WEIGHT_KG_MIN, WEIGHT_KG_MAX]);
  assertEquals([PACE_MIN, PACE_MAX], [WEIGHT_KG_MIN, WEIGHT_KG_MAX]);
});

// ---------------------------------------------------------------------------
// ③ LES TROIS COPIES DU FRONT — AUCUN IMPORT NE PEUT LES ATTEINDRE
// ---------------------------------------------------------------------------

Deno.test("X1′ — les QUATRE copies du front portent les mêmes deux nombres", () => {
  // Le front est en Vite/TS, le back en Deno. La copie est assumée; la dérive,
  // non. Une borne plus large côté écran laisse saisir une valeur que le
  // serveur rejettera; plus étroite, elle interdit une valeur légitime.
  for (
    const file of [
      "frontend/src/keel/api/weeklyCheckIn.ts",
      "frontend/src/keel/api/bodyMeasures.ts",
      // ⟳ FF-062 C2 (2026-09-02) — la QUATRIÈME. `api/weighIn.ts` ne peut pas
      // importer celles de `bodyMeasures.ts`: `/app/chat` ne déclare pas le
      // namespace `plan`, et la couture des pages refuse qu'un écran atteigne
      // un vocabulaire qu'il n'a pas déclaré. La copie est donc assumée, et
      // c'est cette ligne qui l'empêche de dériver.
      "frontend/src/keel/api/weighIn.ts",
    ]
  ) {
    const source = executedLines(readRepo(file)).join("\n");
    for (
      const [name, value] of [
        ["WEIGHT_KG_MIN", WEIGHT_KG_MIN],
        ["WEIGHT_KG_MAX", WEIGHT_KG_MAX],
      ] as const
    ) {
      const m = source.match(new RegExp(`${name}\\s*=\\s*(-?[\\d.]+)`));
      assert(m, `${file}: ${name} n'y est plus déclaré`);
      assertEquals(
        Number(m![1]),
        value,
        `${file}: ${name} a dérivé du back (${m![1]} au lieu de ${value})`,
      );
    }
  }

  // `weekInFood.ts` n'exporte pas de constante: il porte les deux nombres EN
  // LITTÉRAL dans son refus. `energy_target_test.ts` le vérifie déjà par la
  // chaîne exacte; on le refait ici pour que la garde de `X1′` couvre TOUTES
  // les copies du front, et pas seulement celles qui exportent.
  const week = executedLines(readRepo("frontend/src/keel/lib/weekInFood.ts"))
    .join("\n");
  assert(
    week.includes(`w < ${WEIGHT_KG_MIN} || w > ${WEIGHT_KG_MAX}`),
    "weekInFood.ts ne refuse plus sur les bornes du back: son littéral a dérivé",
  );
});

// ---------------------------------------------------------------------------
// ④ LA COPIE QUI RESTE EST NOMMÉE, PAS SILENCIEUSE
// ---------------------------------------------------------------------------

Deno.test("X1′-a — la divergence de `body_measure_floor` est CONNUE et fichée", () => {
  // `body_measure_floor.ts` est un PLANCHER DE SÉCURITÉ déclaré: il arme
  // `restriction_guard` sur la perte rapide. `X1′` ne réécrit pas une ligne de
  // sécurité, donc son 350 est GARDÉ — mais il est asserté ici pour qu'il ne
  // puisse pas se faire passer pour un alignement.
  //
  // Son en-tête dit « Alignées mot pour mot sur `student_body_io.ts` et sur le
  // formulaire hebdo »: c'était déjà faux du formulaire (400) AVANT ce lot, et
  // c'est maintenant faux de `student_body_io.ts` aussi.
  //
  // ⚠️ CE TEST EST FAIT POUR ROUGIR LE JOUR OÙ QUELQU'UN TRANCHE. Rougir, ici,
  // veut dire « ferme la fiche `X1′-a` et supprime ce test », pas « remets 350 ».
  assertEquals(BODY_MEASURE_BOUNDS.weight_kg_min, WEIGHT_KG_MIN);
  assertEquals(
    BODY_MEASURE_BOUNDS.weight_kg_max,
    350,
    "La borne haute du plancher de reconnaissance a bougé. Si c'est pour " +
      "l'aligner sur 400, c'est la fiche `X1′-a` qui se ferme: retire ce test " +
      "et corrige l'en-tête de body_measure_floor.ts.",
  );
  assert(
    BODY_MEASURE_BOUNDS.weight_kg_max < WEIGHT_KG_MAX,
    "divergence attendue, fichée `X1′-a`",
  );
});
