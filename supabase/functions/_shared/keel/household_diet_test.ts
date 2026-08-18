import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  dietDiverges,
  dietServingConflicts,
  HOUSEHOLD_DIET_ANSWERS,
  householdDietBlock,
  memberRegime,
  regimeCapsProtein,
  strictestRegimeAt,
} from "./household_diet.ts";
import {
  DIETARY_REGIMES,
  type DietaryRegime,
  dietaryRegimePromptLine,
  excludedGroupsFor,
} from "./dietary_regime.ts";
import {
  NEUTRAL_DIRECTION,
  readServingDemands,
  SERVING_DIRECTION,
} from "./household_portions.ts";

// ---------------------------------------------------------------------------
// LE VOCABULAIRE
// ---------------------------------------------------------------------------

Deno.test("les quatre réponses, et `omnivore` n'est PAS un régime", () => {
  assertEquals([...HOUSEHOLD_DIET_ANSWERS], [
    "omnivore",
    "vegetarian",
    "vegan",
    "pescatarian",
  ]);
  // ⚠️ LE POINT DU TEST: « je mange de tout » ne pose AUCUNE restriction, donc
  // il traverse en `null` comme « personne n'a demandé ». La distinction entre
  // les deux appartient à la base et à l'écran (elle vaut un plan de viande
  // servi à un végétarien); elle n'a rien à faire dans la casserole.
  assertEquals(memberRegime("omnivore"), null);
  assertEquals(memberRegime(null), null);
  assertEquals(memberRegime("chocolatarian"), null);
  assertEquals(memberRegime("vegan"), "vegan");
});

// ---------------------------------------------------------------------------
// R4 — L'ORDRE DES RÉGIMES EST TOTAL, ET C'EST CE QUI AUTORISE LE CLASSEMENT
// ---------------------------------------------------------------------------

Deno.test("R4 — les exclusions des régimes sont EMBOÎTÉES, paire par paire", () => {
  // ⚠️ CE TEST EST LA PRÉMISSE DE `strictestRegimeAt`, PAS UNE CURIOSITÉ.
  // Ce module classe les régimes par NOMBRE de groupes exclus, et ce nombre n'a
  // le droit de les ordonner que si leurs exclusions s'emboîtent. Le jour où un
  // régime non comparable entre (« pas de poisson mais de la viande »), c'est
  // CE test qui rougit — avant qu'un plus-strict n'ait été choisi sans exclure
  // tout ce que la table exclut, c'est-à-dire avant qu'on ne serve du poisson à
  // quelqu'un qui a dit qu'il n'en mangeait pas.
  for (const a of DIETARY_REGIMES) {
    for (const b of DIETARY_REGIMES) {
      const ga = new Set<string>(excludedGroupsFor(a));
      const gb = new Set<string>(excludedGroupsFor(b));
      const aCoversB = [...gb].every((g) => ga.has(g));
      const bCoversA = [...ga].every((g) => gb.has(g));
      assert(
        aCoversB || bCoversA,
        `${a} et ${b} ne sont pas comparables: le classement par taille ` +
          `choisirait un « plus strict » qui n'exclut pas tout ce que la ` +
          `table exclut.`,
      );
      // Et la taille dit bien lequel contient l'autre.
      if (ga.size > gb.size) assert(aCoversB, `${a} plus gros que ${b} sans le contenir`);
    }
  }
});

Deno.test("R4 — le plus restrictif de la table, et le désarmement", () => {
  assertEquals(strictestRegimeAt([]), null);
  // LE DÉSARMEMENT: personne n'a rien déclaré, ou tout le monde mange de tout.
  assertEquals(strictestRegimeAt([null, null]), null);
  assertEquals(strictestRegimeAt(["omnivore", "omnivore"]), null);
  // UN OMNIVORE PEUT MANGER VÉGÉTARIEN, L'INVERSE EST FAUX.
  assertEquals(strictestRegimeAt(["omnivore", "vegetarian"]), "vegetarian");
  assertEquals(strictestRegimeAt(["vegetarian", "omnivore"]), "vegetarian");
  assertEquals(strictestRegimeAt(["pescatarian", "vegetarian"]), "vegetarian");
  assertEquals(strictestRegimeAt(["vegetarian", "vegan"]), "vegan");
  assertEquals(strictestRegimeAt(["vegan", "pescatarian", "omnivore"]), "vegan");
  // Un jeton hors des quatre ne peut pas devenir une position.
  assertEquals(strictestRegimeAt(["chocolatarian", "omnivore"]), null);
});

// ---------------------------------------------------------------------------
// R5 — LE PLAFOND, ET CE QUI SÉPARE LES DEUX CAS DE LA VÉRIFICATION
// ---------------------------------------------------------------------------

Deno.test("R5 — seul le régime qui retire TOUTE ancre animale plafonne", () => {
  // C'est EXACTEMENT ce qui sépare les deux cas de la vérification: une table
  // végétarienne compose un seul plat (les œufs et le yaourt restent), une
  // table végane peut en composer deux.
  assertEquals(regimeCapsProtein("vegan"), true);
  assertEquals(regimeCapsProtein("vegetarian"), false);
  assertEquals(regimeCapsProtein("pescatarian"), false);
});

Deno.test("R5 — le plafond mord sur `larger`, jamais sur `full` ni en dessous", () => {
  const conflictsFor = (goal: keyof typeof SERVING_DIRECTION) =>
    dietServingConflicts("vegan", readServingDemands(SERVING_DIRECTION[goal]));
  // `muscle_gain` = « larger protein and starch share ».
  assertEquals(conflictsFor("muscle_gain"), ["protein:larger_above_regime"]);
  // ⚠️ LES QUATRE AUTRES NE MORDENT PAS, ET C'EST LA MOITIÉ QUI COMPTE. Un
  // plafond descendu à `balanced` ferait diverger presque toute la population à
  // chaque table végane — c'est-à-dire fabriquer un second plat pour tout le
  // monde, et faire payer le temps de cuisine pour une distinction que la
  // casserole sait tenir.
  assertEquals(conflictsFor("fat_loss"), []);
  assertEquals(conflictsFor("maintenance"), []);
  assertEquals(conflictsFor("maintenance"), []);
  assertEquals(conflictsFor("maintenance"), []);
  assertEquals(conflictsFor("maintenance"), []);
  assertEquals(dietServingConflicts("vegan", readServingDemands(NEUTRAL_DIRECTION)), []);
  // Un régime qui ne plafonne pas ne mord sur personne.
  assertEquals(
    dietServingConflicts("vegetarian", readServingDemands(SERVING_DIRECTION.muscle_gain)),
    [],
  );
});

Deno.test("R5 — un axe ILLISIBLE ne lève pas de plat, il est déjà compté ailleurs", () => {
  // `servingConflicts` traite `unreadable` comme un conflit, sur le MÊME membre
  // et dans le MÊME appelant. Le compter une seconde fois ici ferait lever un
  // plat « pour le régime » à quelqu'un dont c'est la DIRECTION qu'on n'a pas
  // su lire — une raison fausse dans une trace coûte une journée à qui la relit.
  const demands = readServingDemands("protein share and vegetables");
  assertEquals(demands.protein, "unreadable");
  assertEquals(dietServingConflicts("vegan", demands), []);
});

Deno.test("R5 — les DEUX prémisses de la divergence sont armées", () => {
  const muscle = readServingDemands(SERVING_DIRECTION.muscle_gain);
  // ① Le plus strict est plus strict que le sien ⇒ divergence.
  assert(dietDiverges({ strictest: "vegan", own: null, demands: muscle }));
  assert(dietDiverges({ strictest: "vegan", own: "vegetarian", demands: muscle }));
  // ① DÉSARMÉE: elle porte elle-même le régime le plus strict. Le plat commun
  // EST son plat, et lever un second plat végane à côté d'un plat végane est le
  // gaspillage exact que cette prémisse existe pour empêcher.
  assert(!dietDiverges({ strictest: "vegan", own: "vegan", demands: muscle }));
  // ② DÉSARMÉE: sa direction sort très bien de la casserole végane. Un omnivore
  // sans objectif à une table végane mange le plat végane, comme avant.
  assert(!dietDiverges({
    strictest: "vegan",
    own: null,
    demands: readServingDemands(NEUTRAL_DIRECTION),
  }));
  // ② DÉSARMÉE aussi quand le plus strict ne plafonne rien: une table
  // végétarienne compose UN plat, y compris pour une prise de masse. C'est le
  // cas ① de la vérification, et c'est le cas qui PASSE.
  assert(!dietDiverges({ strictest: "vegetarian", own: null, demands: muscle }));
  // LE DÉSARMEMENT TOTAL.
  assert(!dietDiverges({ strictest: null, own: null, demands: muscle }));
});

// ---------------------------------------------------------------------------
// LE BLOC DE PROMPT
// ---------------------------------------------------------------------------

Deno.test("le bloc est VIDE quand personne n'a rien déclaré", () => {
  // C'est le désarmement, et c'est ce qui rend le prompt byte-identique à celui
  // d'avant le lot pour tout le foyer d'hier.
  assertEquals(
    householdDietBlock({ strictest: null, heldBy: ["Thomas"], divergingNames: [] }),
    "",
  );
});

Deno.test("la consigne du bloc est CELLE DU MOTEUR, mot pour mot", () => {
  // ⚠️ LE POINT DU TEST. Une phrase neuve écrite dans le bloc du foyer aurait
  // compté sur la culture du modèle pour dériver la liste — et c'est très
  // exactement là que passent le nuoc-mâm, la gélatine et le bouillon de
  // volaille d'une soupe « de légumes ». Le jour où quelqu'un récrit cette
  // consigne pour le foyer, ce test rougit.
  for (const regime of DIETARY_REGIMES) {
    const block = householdDietBlock({
      strictest: regime,
      heldBy: ["Christèle"],
      divergingNames: [],
    });
    assert(
      block.includes(dietaryRegimePromptLine(regime)),
      `${regime}: la consigne du moteur n'est pas dans le bloc`,
    );
  }
});

Deno.test("le bloc nomme qui porte la ligne, et interdit d'en faire une raison", () => {
  const block = householdDietBlock({
    strictest: "vegetarian" as DietaryRegime,
    heldBy: ["Christèle"],
    divergingNames: ["Thomas"],
  });
  assert(block.includes("Christèle"));
  // La ligne d'encadrement dit que ce qui suit gouverne LE PLAT PARTAGÉ — sans
  // elle, « This student is VEGETARIAN » ferait croire à une seule personne.
  assert(block.includes("SHARED DISH"));
  assert(block.includes("Never write it as a reason"));
  // Et le divergent est nommé, avec ce que son plat a le droit de contenir.
  assert(block.includes("Thomas cannot be served from that shared dish"));
});

Deno.test("AUCUN NOM DE RÉGIME NE PART SEUL: la ligne du moteur porte l'expansion", () => {
  // Cicatrice du dépôt (`dietary_regime.ts`, en tête): armer quoi que ce soit
  // sur le mot « vegan » ferait rejeter les réponses qui décrivent un plat comme
  // végan — donc les BONNES réponses, et seulement pour les végans. Ce bloc ne
  // rend jamais le jeton nu: il rend la consigne, qui nomme les familles.
  const block = householdDietBlock({
    strictest: "vegan",
    heldBy: [],
    divergingNames: [],
  });
  assert(block.includes("no eggs"));
  assert(block.includes("no dairy"));
  assert(block.includes("fish sauce"));
});
