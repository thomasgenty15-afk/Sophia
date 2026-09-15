// KEEL W9 — ceintures de la resolution de langue de reponse (CONTRACT R3).
//
// Chaque ceinture porte sa CONDITION DE DESARMEMENT (doctrine P9): la seule
// facon legitime de la retirer, jamais "le code a change".

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  appendResponseLanguageBlock,
  appendContentLanguageBlock,
  buildContentLanguageBlock,
  buildResponseLanguageBlock,
  isFrenchLocale,
  localePackKey,
  readExplicitConversationLocale,
  readPersistedConversationLocale,
  resolveArtifactLocale,
  resolveResponseLocale,
  withPersistedConversationLocale,
} from "./locale.ts";

/** Aucune entree. Le type l'EXIGE maintenant: `{}` ne compile plus. */
const NO_INPUTS = {
  userExplicit: null,
  persisted: null,
  studentProfile: null,
  tenantDefault: null,
  detectedRecent: null,
} as const;

Deno.test("R3 — l'epingle pilote est RETIREE: la chaine decide, plus la constante", () => {
  // CE TEST REMPLACE « pendant le pilote, toute resolution rend en-US ».
  // L'ancien affirmait le contraire de chaque ligne ci-dessous; sa condition de
  // desarmement etait ecrite dans `locale.ts` (« supprimer la constante et ses
  // deux gardes »), et elle a ete honoree le 2026-08-08 (lot L1).
  //
  // Ce qu'il garde maintenant: la chaine LIT ses entrees. Le mode de panne
  // qu'on ferme n'est plus « le pilote force une langue », c'est « quelqu'un
  // re-pose un court-circuit au-dessus de la chaine » — un `return` constant
  // en tete de fonction rendrait TOUTES les assertions suivantes fausses.
  //
  // Condition de desarmement: aucune. Une langue imposee a toute une flotte se
  // pose sur une colonne de tenant (`tenantDefault`), jamais dans le module.
  assertEquals(
    resolveResponseLocale({ ...NO_INPUTS, persisted: "fr-FR" }),
    "fr-FR",
  );
  assertEquals(
    resolveResponseLocale({ ...NO_INPUTS, userExplicit: "fr-FR" }),
    "fr-FR",
  );
  assertEquals(
    resolveArtifactLocale({ studentProfile: "fr-FR", tenantDefault: null }),
    "fr-FR",
  );
  // Le repli final n'a pas bouge: sans AUCUNE entree, c'est en-US.
  assertEquals(resolveResponseLocale(NO_INPUTS), "en-US");
  assertEquals(
    resolveArtifactLocale({ studentProfile: null, tenantDefault: null }),
    "en-US",
  );
});

Deno.test("R3 — l'ordre de priorite, entree par entree", () => {
  // Une chaine de priorite non testee entree par entree est une liste de
  // souhaits: l'epingle a vecu deux mois au-dessus d'une chaine « ecrite,
  // relue, jamais executee ».
  // Cinq tags DISTINCTS et tous LIVRÉS (en/fr): un tag non livré serait ramené
  // au repli par la ceinture R7 ci-dessous et le test ne mesurerait plus
  // l'ordre, mais la clameur.
  const all = {
    userExplicit: "fr-FR",
    persisted: "en-GB",
    studentProfile: "fr-CA",
    tenantDefault: "en-AU",
    detectedRecent: "fr-BE",
  };
  assertEquals(resolveResponseLocale(all), "fr-FR");
  assertEquals(resolveResponseLocale({ ...all, userExplicit: null }), "en-GB");
  assertEquals(
    resolveResponseLocale({ ...all, userExplicit: null, persisted: null }),
    "fr-CA",
  );
  assertEquals(
    resolveResponseLocale({
      ...all,
      userExplicit: null,
      persisted: null,
      studentProfile: null,
    }),
    "en-AU",
  );
  assertEquals(
    resolveResponseLocale({
      ...all,
      userExplicit: null,
      persisted: null,
      studentProfile: null,
      tenantDefault: null,
    }),
    "fr-BE",
  );
  // Une chaine d'espaces n'est pas une reponse: elle ne doit pas court-circuiter
  // le maillon suivant (meme regle que l'ancre `readPersisted...`).
  assertEquals(
    resolveResponseLocale({ ...NO_INPUTS, persisted: "   ", studentProfile: "fr-FR" }),
    "fr-FR",
  );
});

Deno.test("R7 — une langue NON LIVREE degrade au resolveur, pas dans un pack", () => {
  // L'epingle rendait le throw de `localePackKey` INATTEIGNABLE: tout arrivait
  // en `en`. Une seule ligne `profiles.locale = 'de-DE'` suffit, l'epingle
  // retiree, a le faire jeter dans `render.ts`, `labels.ts`,
  // `photo_invitation.ts` et `meal_precision.ts` — donc a tuer un tour, une
  // journee de cron ou une edge function.
  //
  // La degradation se fait ICI, une fois, sur le tour ENTIER. Un tour
  // entierement anglais est coherent; un tour a moitie anglais est exactement
  // ce que R7 interdit.
  //
  // Condition de desarmement: livrer le pack de la langue (labels + render +
  // packs), puis l'ajouter a `DELIVERED_LANGUAGE_PREFIXES`. Jamais l'inverse.
  assertEquals(
    resolveResponseLocale({ ...NO_INPUTS, studentProfile: "de-DE" }),
    "en-US",
  );
  assertEquals(
    resolveResponseLocale({ ...NO_INPUTS, userExplicit: "sw-KE" }),
    "en-US",
  );
  assertEquals(
    resolveArtifactLocale({ studentProfile: "de-DE", tenantDefault: null }),
    "en-US",
  );
  // Les deux langues livrees traversent, region comprise.
  assertEquals(
    resolveResponseLocale({ ...NO_INPUTS, studentProfile: "fr-CA" }),
    "fr-CA",
  );
  assertEquals(
    resolveResponseLocale({ ...NO_INPUTS, studentProfile: "en-GB" }),
    "en-GB",
  );
  // Et le resultat du resolveur est TOUJOURS un argument valide de
  // `localePackKey`: c'est le contrat que cette ceinture etablit.
  for (const input of ["de-DE", "sw-KE", "fr-CA", "en-GB", "xx"]) {
    localePackKey(
      resolveResponseLocale({ ...NO_INPUTS, studentProfile: input }),
    );
  }
});

Deno.test("R3 — `studentProfile` existe, et le retirer re-fabrique le defaut de l'epingle", () => {
  // LA LEÇON DU LOT L1, figee ici. Retirer `PILOT_FORCED_LOCALE` etait un
  // NO-OP tant que la chaine ne portait aucune entree issue de l'eleve:
  // `tenantDefault` n'a pas encore de producteur, `detectedRecent` n'en aura
  // jamais (c'est l'oscillation que R3 nomme). Un eleve `fr-FR` tout neuf,
  // sans ancre, serait donc tombe sur le repli final `en-US` — meme reponse
  // anglaise, par un chemin plus long.
  //
  // Condition de desarmement: le jour ou `tenantDefault` ET un autre porteur
  // de la langue de l'eleve existent, et seulement si l'un d'eux est LU.
  assertEquals(
    resolveResponseLocale({ ...NO_INPUTS, studentProfile: "fr-FR" }),
    "fr-FR",
  );
  assertEquals(
    resolveResponseLocale({ ...NO_INPUTS, studentProfile: "en-GB" }),
    "en-GB",
  );
});

Deno.test("R3 — la chaine de priorite est TYPEE: aucune entree ne s'omet", () => {
  // Ceinture de compilation, pas d'execution. Les quatre champs sont requis,
  // et c'est tout le mecanisme: huit lanes passaient `{}` — une chaine de
  // priorite sans aucune entree, donc une langue decidee par son repli. Le
  // type est ce qui a rendu ces huit sites visibles au compilateur.
  //
  // Desarmement: aucun. Rendre un champ optionnel ici re-ouvre exactement la
  // classe de defaut que W9 a payee.
  const inputs: Parameters<typeof resolveResponseLocale>[0] = NO_INPUTS;
  assertEquals(Object.keys(inputs).sort(), [
    "detectedRecent",
    "persisted",
    "studentProfile",
    "tenantDefault",
    "userExplicit",
  ]);
});

Deno.test("R7 — localePackKey jette sur une langue non livree", () => {
  // Le repli silencieux vers l'anglais livrerait un ecran francais avec des
  // phrases anglaises dedans, decouvert par un client et non par un test.
  assertEquals(localePackKey("fr-FR"), "fr");
  assertEquals(localePackKey("en-GB"), "en");
  let threw = false;
  try {
    localePackKey("de-DE");
  } catch {
    threw = true;
  }
  assert(threw, "une locale sans pack livre DOIT jeter (R7)");
});

Deno.test("R3 — le fil porte sa langue: un lecteur, un ecrivain", () => {
  // Desarmement: aucun tant qu'un composeur visible existe. Sans persistance,
  // la langue oscille d'un tour a l'autre — le mode de panne que R3 nomme.
  assertEquals(readPersistedConversationLocale({}), null);
  assertEquals(readPersistedConversationLocale(null), null);
  // Fausse premisse: une chaine vide n'est pas une ancre. La traiter comme
  // telle figerait un fil sur "" et court-circuiterait toute la chaine.
  assertEquals(
    readPersistedConversationLocale({ conversation_locale: "   " }),
    null,
  );

  const written = withPersistedConversationLocale({ other: 1 }, "fr-FR");
  assertEquals(readPersistedConversationLocale(written), "fr-FR");
  // L'ecrivain n'ecrase pas le reste de temp_memory.
  assertEquals(written.other, 1);

  // La demande EXPLICITE est un canal DISTINCT de l'ancre: c'est la seule
  // entree autorisee a deplacer un fil deja ancre.
  assertEquals(readExplicitConversationLocale(written), null);
  assertEquals(
    readExplicitConversationLocale({ conversation_locale_explicit: "fr-FR" }),
    "fr-FR",
  );
});

Deno.test("R1/R2 — le bloc CONTENT_LANGUAGE nomme les champs traduisibles ET les jetons", () => {
  // Une sortie JSON ne peut pas recevoir "write your entire visible reply in
  // French": c'est une consigne contradictoire qui invite le modele a
  // emballer le JSON de prose. D'ou un bloc distinct.
  const block = buildContentLanguageBlock("fr-FR", ["title", "why"], [
    "slot",
    "day",
  ]);
  assert(block.startsWith("CONTENT_LANGUAGE:"));
  assert(block.includes("French (fr-FR)"));
  assert(block.includes("title, why"));
  // Le bloc etant EN DERNIER, il gagne par recence sur toute regle "copie ce
  // jeton caractere par caractere" enoncee plus haut dans le prompt. Il doit
  // donc re-enoncer les jetons lui-meme.
  assert(block.includes("slot, day"));
  assert(block.includes("MACHINE TOKENS"));
  assert(block.includes("single JSON object"));

  // R7: un bloc qui ne nomme aucun champ traduisible est un bug d'appelant,
  // pas un cas degenere — il depense des jetons pour ne rien dire, et se lit
  // en relecture comme un axe de langue cable.
  let threw = false;
  try {
    buildContentLanguageBlock("fr-FR", [], ["slot"]);
  } catch {
    threw = true;
  }
  assert(threw, "translatableFields vide DOIT jeter (R7)");

  // Meme contrat positionnel et meme idempotence que son frere visible.
  const prompt = appendContentLanguageBlock("SYSTEM:\n- a rule", "fr-FR", [
    "title",
  ], ["slot"]);
  assert(prompt.startsWith("SYSTEM:"));
  assertEquals(
    appendContentLanguageBlock(prompt, "fr-FR", ["title"], ["slot"]),
    prompt,
  );
});

Deno.test("R3 — le bloc nomme la langue en clair ET protege les jetons", () => {
  const en = buildResponseLanguageBlock("en-US");
  assert(en.startsWith("RESPONSE_LANGUAGE:"));
  assert(en.includes("English (en-US)"));
  // R1: la consigne de langue ne doit JAMAIS autoriser la traduction des
  // slugs. C'est exactement la faute weekday-francais que KEEL existe pour
  // tuer, reintroduite par la porte de la localisation.
  assert(en.includes("never translate slugs"));

  assert(buildResponseLanguageBlock("fr-FR").includes("French (fr-FR)"));
  // R7: un prefixe inconnu ne jette pas — il degrade en nommant le tag, qui
  // reste une instruction sans ambiguite pour le modele.
  assert(buildResponseLanguageBlock("sw-KE").includes("(sw-KE)"));
});

Deno.test("R3 — appendResponseLanguageBlock place le bloc en DERNIER, et une seule fois", () => {
  const base = "SYSTEM:\n- a rule\n";
  const once = appendResponseLanguageBlock(base, "en-US");
  assert(once.startsWith("SYSTEM:"));
  assert(once.endsWith("or any machine-read identifier (R1)."));

  // Idempotence: un composeur qui passe deux fois (retry, repair prompt) ne
  // doit pas empiler deux blocs contradictoires en queue.
  const twice = appendResponseLanguageBlock(once, "en-US");
  assertEquals(twice, once);
  assertEquals(twice.split("RESPONSE_LANGUAGE:").length - 1, 1);
});

Deno.test("R3 — le gel SURFACE_FORM se lit sur un seul predicat", () => {
  // Desarmement: aucun. Les ceintures a morphologie francaise de
  // BELT_AUDIT.md restent armees derriere ce predicat tant qu'elles existent.
  assert(isFrenchLocale("fr-FR"));
  assert(isFrenchLocale("fr-CA"));
  assert(isFrenchLocale("FR"));
  assertEquals(isFrenchLocale("en-US"), false);
  assertEquals(isFrenchLocale(null), false);
  // Fausse premisse: une locale vide n'est pas francaise. Un fail-open vers
  // "fr" rearmerait des detecteurs francais sur un locuteur anglophone.
  assertEquals(isFrenchLocale(""), false);
});
