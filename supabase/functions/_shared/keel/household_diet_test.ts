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
    householdDietBlock({ strictest: null, heldBy: ["Thomas"], divergingNames: [], freeNames: [] }),
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
      freeNames: [],
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
    freeNames: [],
    divergingNames: ["Thomas"],
  });
  assert(block.includes("Christèle"));
  // La ligne d'encadrement dit que ce qui suit gouverne LE PLAT PARTAGÉ — sans
  // elle, « This student is VEGETARIAN » ferait croire à une seule personne.
  // ⟳ 2026-09-04 — LA BASE, PLUS LE PLAT ENTIER. Sans cette ligne
  // d'encadrement, « This student is VEGETARIAN » ferait croire à une seule
  // personne; et « DISH » ferait descendre toute l'assiette au plus strict,
  // ce qui est précisément ce que la boîte d'échange corrige.
  assert(block.includes("SHARED BASE"));
  assert(block.includes("Never write it as a reason"));
  // Et le divergent est nommé — il porte désormais un repas À LUI (habitude
  // déclarée), plus une divergence de régime: celle-là se règle par une boîte.
  assert(block.includes("Thomas eat a dish of their OWN"));
});

Deno.test("⟳ 2026-09-04 — LE COMPOSANT QUI SÉPARE EST SERVI PAR BOÎTE, ET LA CLÉ EST À CÔTÉ", () => {
  const block = householdDietBlock({
    strictest: "vegetarian" as DietaryRegime,
    heldBy: ["Léa"],
    freeNames: [],
    divergingNames: [],
  });

  // ⚠️ LES PHRASES SE LISENT SUR LE TEXTE MIS À PLAT, pas sur le brut: le bloc
  // est enroulé à ~76 colonnes, et « never a dish of its own » tombe à cheval
  // sur deux lignes. Un test qui dépend de l'endroit du retour à la ligne
  // rougit au premier mot ajouté ailleurs, sans qu'aucune règle n'ait bougé.
  // Même geste que `precedence_tail_test`.
  const flat = block.replace(/\s+/g, " ");

  // ⛔ LA PROMESSE. Sans elle, un seul végétarien fait manger végétarien à six
  // personnes — mesuré, et c'est le défaut que ce lot ferme.
  // ⛔ LA PHRASE ELLE-MÊME DIT « BASE », pas seulement l'en-tête. C'est tout le
  // lot: descendre la BASE au plus strict est la sécurité, descendre le PLAT
  // ENTIER fait manger végétarien à six personnes parce qu'une bouche l'est.
  assert(flat.includes("The BASE the table shares"), block);
  assert(
    !flat.includes("The dish the table shares"),
    "la règle est revenue au plat entier",
  );
  assert(flat.includes("served PER BOX"), block);
  assert(flat.includes("replacement of the same role"), block);
  // ⛔ ET DANS LES DEUX SENS: « one box for everyone else with the original »
  // est la moitié qui sert l'omnivore seul parmi des végétariens. Sans elle, la
  // règle ne ferait que remplacer une majorité qui gagne par une autre.
  assert(
    flat.includes("one box for everyone else with the original"),
    block,
  );
  // La table entière au même régime ne paie pas une seconde boîte.
  assert(flat.includes("one box"), block);

  // ⛔ LA CLÉ DE SCHÉMA EST ADJACENTE À LA PROMESSE. Cicatrice du dépôt: une
  // promesse dont la clé vit cent lignes plus loin est tenue 0 % du temps, et
  // un « ci-dessus » ne traverse pas la frontière système↔utilisateur.
  const promise = block.indexOf("served PER BOX");
  const key = block.indexOf('"boxes"', promise);
  assert(promise >= 0 && key > promise, block);
  assert(key - promise < 300, `clé à ${key - promise} caractères de la promesse`);

  // ⛔ ET L'ÉCHAPPATOIRE EST NOMMÉE. Le modèle écrit la divergence dans
  // `member_portions` dès qu'on lui interdit sans nommer la sortie qu'il prend
  // à la place — onze fois sur douze quand le plat dédié a été introduit.
  assert(flat.includes("never a portion_note"), block);
  assert(flat.includes("never a dish of its own"), block);
});

Deno.test("AUCUN NOM DE RÉGIME NE PART SEUL: la ligne du moteur porte l'expansion", () => {
  // Cicatrice du dépôt (`dietary_regime.ts`, en tête): armer quoi que ce soit
  // sur le mot « vegan » ferait rejeter les réponses qui décrivent un plat comme
  // végan — donc les BONNES réponses, et seulement pour les végans. Ce bloc ne
  // rend jamais le jeton nu: il rend la consigne, qui nomme les familles.
  const block = householdDietBlock({
    strictest: "vegan",
    heldBy: [],
    freeNames: [],
    divergingNames: [],
  });
  assert(block.includes("no eggs"));
  assert(block.includes("no dairy"));
  assert(block.includes("fish sauce"));
});

Deno.test("⛔ RUN RÉEL 2026-09-04 — LE BLOC DIT QUE LES AUTRES MANGENT ENCORE DE LA VIANDE", () => {
  // ── LE DÉFAUT, MESURÉ DEUX FOIS EN CONDITIONS RÉELLES ─────────────────
  // Foyer de cinq, UNE bouche végétarienne. Les deux tirs ont rendu un plan
  // **entièrement végétarien** — `regime_belt.bites = 0`, une seule boîte par
  // repas, les cinq noms dessus. Le second portait pourtant une envie écrite:
  // « On a envie de poulet et de bœuf cette semaine. »
  //
  // Le modèle n'a rien violé. Le bloc décrivait comment SÉPARER un composant
  // quand le plat en porte un, sans jamais dire qu'il devait y en avoir un —
  // et la ligne du moteur juste au-dessus dit « choose a different dish rather
  // than a version that omits it ». Il a choisi d'autres plats.
  const mixed = householdDietBlock({
    strictest: "vegetarian" as DietaryRegime,
    heldBy: ["Léa"],
    freeNames: ["Claire", "Marc", "Tom", "Zoé"],
    divergingNames: [],
  }).replace(/\s+/g, " ");

  assert(mixed.includes("Claire, Marc, Tom, Zoé are not bound by that line"), mixed);
  assert(mixed.includes("they still eat meat, poultry and fish"), mixed);
  // ⛔ LES DEUX INTERDICTIONS NOMMÉES. « ne retire pas » et « ne remplace pas
  // pour tout le monde » sont deux fautes distinctes, et c'est la seconde que
  // les deux runs ont produite.
  assert(mixed.includes("Do NOT drop the animal protein"), mixed);
  assert(mixed.includes("do NOT replace it for everyone"), mixed);

  // ⛔ ET ELLE VIENT AVANT LA MÉCANIQUE: dire comment séparer ne sert à rien
  // tant que le modèle ne sait pas qu'il y a quelque chose à séparer.
  assert(
    mixed.indexOf("still eat meat") < mixed.indexOf("served PER BOX"),
    "la mécanique de l'échange précède la raison de l'échanger",
  );
});

Deno.test("⛔ UN FOYER ENTIÈREMENT VÉGÉTARIEN NE PAIE PAS CETTE PHRASE", () => {
  // La contre-épreuve, et elle est obligatoire: `freeNames: []` veut dire
  // « personne ici ne mange en dehors de cette ligne ». Lui servir « les autres
  // mangent encore de la viande » serait lui demander d'en cuisiner.
  const all = householdDietBlock({
    strictest: "vegan" as DietaryRegime,
    heldBy: ["Léa", "Claire"],
    freeNames: [],
    divergingNames: [],
  });
  assertEquals(all.includes("still eat meat"), false, all);
  assertEquals(all.includes("not bound by that line"), false, all);
});
