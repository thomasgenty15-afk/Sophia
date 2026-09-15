// LE CHAT NE RANGE RIEN: IL RENVOIE — lot M1.
//
// Ce que ces tests existent pour empêcher, dans l'ordre où ça a déjà coûté:
//
//   1. UNE PHRASE QUI PROMET UN ENREGISTREMENT QUI N'A PAS LIEU. C'est la
//      panne `student_safety_constraints`: six lecteurs armés, zéro écrivain,
//      et « Noted, I'll keep it in mind » rendu à quelqu'un qui déclarait une
//      anaphylaxie. **Le mensonge était une phrase rassurante.** Ici, le
//      runtime n'écrit rien PAR CONSTRUCTION — donc chaque mot qui laisse
//      croire le contraire est la même panne, en plus petit.
//   2. UNE GARDE TESTÉE DANS UNE SEULE LANGUE. « not » ne couvre pas
//      « doesn't ». `profiles.locale` vaut `fr-FR` par défaut sur ce produit:
//      une phrase française fautive passerait sous une liste anglaise.
//   3. UN JETON INCONNU QUI DÉCLENCHE QUELQUE CHOSE. La liste est fermée, et
//      le silence est la bonne réponse quand on ne sait pas de quoi le tour
//      parlait.
//   4. UNE GARDE SANS CAS PASSANT. Cassée, elle bloque tout et ressemble trait
//      pour trait à une garde qui marche.
//
// env purgé: env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
//   deno test --allow-read --allow-env --no-check \
//   supabase/functions/_shared/keel/conversation_redirect_test.ts

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  allRedirectSentences,
  appendRedirect,
  FORBIDDEN_STORAGE_CLAIMS,
  PROFILE_REDIRECT_KINDS,
  PROFILE_REDIRECT_SENTENCES,
  profileRedirectFor,
  profileRedirectKindOf,
  profileRedirectSentence,
  SIZING_FEEDBACK_KINDS,
  SIZING_REDIRECT_SENTENCES,
  sizingFeedbackDetected,
  sizingRedirectFor,
  sizingRedirectSentence,
} from "./conversation_redirect.ts";
import { canProduce, RETAINED_KINDS } from "./retained_item.ts";

// ===========================================================================
// 1. ⛔ LA RÈGLE DE FORMULATION — la clause du lot, tenue par un test
// ===========================================================================

Deno.test("⛔ aucune phrase ne prétend avoir enregistré quoi que ce soit", () => {
  // ⚠️ ON RELIT NOS PROPRES LITTÉRAUX, PAS DU TEXTE LIBRE. C'est ce qui
  // distingue cette garde d'un matcher maison: l'ensemble lu est fermé, il fait
  // dix phrases, et on les a tapées. Un faux positif y est impossible.
  const sentences = allRedirectSentences();
  assertEquals(
    sentences.length,
    14,
    "14 = 2 (sizing) + 4 destinations × 2 langues + 2 formes de révocation × 2 langues",
  );

  const guilty: string[] = [];
  for (const sentence of sentences) {
    const haystack = sentence.toLowerCase();
    for (const claim of FORBIDDEN_STORAGE_CLAIMS) {
      if (haystack.includes(claim)) guilty.push(`« ${sentence} » ⟵ "${claim}"`);
    }
  }
  assertEquals(guilty, [], "une phrase promet un enregistrement qui n'a pas lieu");
});

Deno.test("⛔ la garde de formulation MORD — prouvé sur la phrase d'avant", () => {
  // LA CEINTURE DE LA CEINTURE. Une liste d'interdits qui ne reconnaît rien est
  // verte quoi qu'il arrive. On lui donne donc la phrase que ce dépôt a
  // RÉELLEMENT servie avant ce lot — l'ouverture du renvoi de sizing hérité du
  // lot 2C — et elle doit la refuser.
  const before = {
    en:
      "I'm noting that for the end-of-plan review rather than filing it now — for a serving I need to know who it's for.",
    fr:
      "Je garde ça pour le bilan de fin de plan plutôt que de le ranger tout de suite — pour une portion j'ai besoin de savoir pour qui.",
  };
  for (const [lang, sentence] of Object.entries(before)) {
    const haystack = sentence.toLowerCase();
    const bitten = FORBIDDEN_STORAGE_CLAIMS.some((c) => haystack.includes(c));
    assert(bitten, `la garde laisse passer l'ancienne phrase ${lang}`);
  }
});

Deno.test("⛔ la garde couvre LES DEUX LANGUES, et pas une seule", () => {
  // « not » ne couvre pas « doesn't »: une liste qui n'aurait que des termes
  // anglais serait verte sur une phrase française fautive, et réciproquement.
  const french = FORBIDDEN_STORAGE_CLAIMS.filter((c) => /[àâçéèêîôûù']/.test(c) || c.startsWith("je "));
  const english = FORBIDDEN_STORAGE_CLAIMS.filter((c) => c.startsWith("i") || c.startsWith("noted") || c.startsWith("got"));
  assert(french.length >= 4, "la liste ne mord pas assez en français");
  assert(english.length >= 4, "la liste ne mord pas assez en anglais");

  // Et chacune des deux moitiés doit attraper une phrase fautive de SA langue.
  assert(
    french.some((c) => "je le note pour la suite".includes(c)),
    "aucun terme français n'attrape « je le note »",
  );
  assert(
    english.some((c) => "noted, i'll keep that in mind".includes(c)),
    "aucun terme anglais n'attrape « noted, I'll keep that »",
  );
});

Deno.test("aucun terme NIÉ dans la liste des interdits", () => {
  // ⚠️ CICATRICE DE L'ORDRE DES MOTS: « négation après le terme = morsure ».
  // Nos phrases s'ouvrent sur « je n'ai PAS enregistré » / « I haven't saved ».
  // Un interdit portant « enregistré » ou « saved » ferait rougir la garde sur
  // la phrase CORRECTE, et le seul correctif évident serait de retirer le bon
  // mot de la bonne phrase.
  for (const claim of FORBIDDEN_STORAGE_CLAIMS) {
    assert(!claim.includes("enregistr"), `interdit trop large: "${claim}"`);
    assert(!claim.includes("saved"), `interdit trop large: "${claim}"`);
  }
  // Et la preuve par l'usage: les dix phrases passent, alors qu'elles PARLENT
  // toutes d'enregistrement — au négatif.
  for (const sentence of allRedirectSentences()) {
    assert(
      /n'ai pas enregistré|haven't saved/.test(sentence),
      `une phrase ne dit pas explicitement qu'elle ne range rien: « ${sentence} »`,
    );
  }
});

// ===========================================================================
// 2. LES QUATRE DESTINATIONS — liste fermée, silence sur l'inconnu
// ===========================================================================

Deno.test("les quatre destinations ont chacune leurs deux langues", () => {
  assertEquals([...PROFILE_REDIRECT_KINDS], [
    "food_preference",
    "equipment",
    "rhythm",
    "logistics",
  ]);
  for (const kind of PROFILE_REDIRECT_KINDS) {
    const pack = PROFILE_REDIRECT_SENTENCES[kind];
    assert(pack.en.trim().length > 0, `${kind}: pas de phrase EN`);
    assert(pack.fr.trim().length > 0, `${kind}: pas de phrase FR`);
    // ⚠️ ET ELLES SONT DIFFÉRENTES. Deux packs identiques signeraient un
    // copier-coller qui rendrait de l'anglais à une personne francophone.
    assert(pack.en !== pack.fr, `${kind}: les deux langues sont le même texte`);
  }
});

Deno.test("un jeton hors liste ne déclenche RIEN, et ne se replie pas", () => {
  // ⛔ PAS DE DESTINATION PAR DÉFAUT. Replier enverrait la personne vers le
  // mauvais écran, ce qui est pire que de se taire.
  assertEquals(profileRedirectKindOf({ detected: true, kind: "allergy" }), null);
  assertEquals(profileRedirectKindOf({ detected: true, kind: "" }), null);
  assertEquals(profileRedirectKindOf({ detected: true, kind: null }), null);
  assertEquals(profileRedirectKindOf({ detected: true }), null);
  // `detected: false` avec un jeton VALIDE ne déclenche pas non plus: les deux
  // moitiés sont nécessaires.
  assertEquals(profileRedirectKindOf({ detected: false, kind: "equipment" }), null);
  assertEquals(profileRedirectKindOf(null), null);
  assertEquals(profileRedirectKindOf(undefined), null);

  // LE CAS QUI PASSE — sans lui, une garde cassée serait indiscernable.
  assertEquals(
    profileRedirectKindOf({ detected: true, kind: "equipment" }),
    "equipment",
  );
  // Le jeton est normalisé comme celui du sizing: casse et espaces.
  assertEquals(
    profileRedirectKindOf({ detected: true, kind: "  Equipment  " }),
    "equipment",
  );
});

Deno.test("la langue vient du paramètre, jamais d'un défaut anglais", () => {
  // `profiles.locale` vaut `fr-FR` par défaut: un repli anglais serait lu par
  // la majorité des gens.
  for (const kind of PROFILE_REDIRECT_KINDS) {
    assertEquals(
      profileRedirectSentence(kind, "fr-FR"),
      PROFILE_REDIRECT_SENTENCES[kind].fr,
    );
    assertEquals(
      profileRedirectSentence(kind, "fr"),
      PROFILE_REDIRECT_SENTENCES[kind].fr,
    );
    assertEquals(
      profileRedirectSentence(kind, "en-US"),
      PROFILE_REDIRECT_SENTENCES[kind].en,
    );
    // Une langue non livrée retombe sur l'anglais — elle ne LÈVE pas: une
    // phrase d'accompagnement ne doit jamais faire tomber un tour.
    assertEquals(
      profileRedirectSentence(kind, "de-DE"),
      PROFILE_REDIRECT_SENTENCES[kind].en,
    );
    assertEquals(
      profileRedirectSentence(kind, null),
      PROFILE_REDIRECT_SENTENCES[kind].en,
    );
  }
});

Deno.test("⛔ `isKeelStudent` est une GARDE, pas une décoration", () => {
  // Cicatrice « paramètre de garde optionnel = garde désarmée ». Hors élève
  // KEEL, ni la carte ni l'écran de réglages n'existent: la phrase renverrait
  // vers un écran absent.
  const signal = { detected: true, kind: "equipment" };
  assertEquals(
    profileRedirectFor({ signal, locale: "fr-FR", isKeelStudent: false }),
    null,
  );
  assertEquals(
    profileRedirectFor({ signal, locale: "fr-FR", isKeelStudent: true }),
    PROFILE_REDIRECT_SENTENCES.equipment.fr,
  );
  // Même garde sur le renvoi du sizing.
  assertEquals(
    sizingRedirectFor({
      signal: { detected: true, kind: "portion" },
      locale: "fr-FR",
      isKeelStudent: false,
    }),
    null,
  );
  assertEquals(
    sizingRedirectFor({
      signal: { detected: true, kind: "portion" },
      locale: "fr-FR",
      isKeelStudent: true,
    }),
    SIZING_REDIRECT_SENTENCES.fr,
  );
});

// ===========================================================================
// 3. LE RENVOI DU SIZING — inchangé sauf le texte
// ===========================================================================

Deno.test("le sizing garde sa liste fermée et son exigence de `kind`", () => {
  assert(SIZING_FEEDBACK_KINDS.includes("portion"));
  // `detected` seul ne suffit pas: le signal couvre tout retour sur une ligne
  // de plan, et renvoyer dessus ferait sortir la phrase sur des compliments.
  assertEquals(sizingFeedbackDetected({ detected: true, kind: "taste" }), false);
  assertEquals(sizingFeedbackDetected({ detected: true, kind: "" }), false);
  assertEquals(sizingFeedbackDetected({ detected: false, kind: "portion" }), false);
  assertEquals(sizingFeedbackDetected({ detected: true, kind: "PORTION" }), true);
  assertEquals(sizingRedirectSentence("fr-FR"), SIZING_REDIRECT_SENTENCES.fr);
  assertEquals(sizingRedirectSentence("en"), SIZING_REDIRECT_SENTENCES.en);
});

// ===========================================================================
// 4. LE DIRE — un ajout qui ne peut pas appauvrir
// ===========================================================================

Deno.test("`appendRedirect` n'ôte jamais rien et ne double jamais", () => {
  const body = "Voilà pour ce soir.";
  const phrase = PROFILE_REDIRECT_SENTENCES.rhythm.fr;

  // Désarmé: le texte ressort INCHANGÉ. Au pire cette fonction n'ajoute rien.
  assertEquals(appendRedirect(body, null), body);
  assertEquals(appendRedirect(body, undefined), body);
  assertEquals(appendRedirect(body, "   "), body);

  // Armé: la phrase est là, et le corps aussi.
  const out = appendRedirect(body, phrase);
  assert(out.includes(body));
  assert(out.includes(phrase));

  // Rejeu: pas de doublon. Égalité de chaîne sur un gabarit fermé, pas une
  // heuristique de sens.
  assertEquals(appendRedirect(out, phrase), out);

  // Corps vide: la phrase sort seule, sans séparateur orphelin.
  assertEquals(appendRedirect("", phrase), phrase);
  assertEquals(appendRedirect("   ", phrase), phrase);
});

Deno.test("les deux renvois peuvent sortir sur le MÊME tour", () => {
  // « ça m'a fait beaucoup trop de riz, et de toute façon je n'ai pas de four »
  // porte les deux signaux, et ils vont vers deux écrans différents. En garder
  // un seul ferait perdre l'autre en silence — la panne que ce lot ferme.
  let out = "D'accord.";
  out = appendRedirect(out, SIZING_REDIRECT_SENTENCES.fr);
  out = appendRedirect(out, PROFILE_REDIRECT_SENTENCES.equipment.fr);
  assert(out.includes(SIZING_REDIRECT_SENTENCES.fr));
  assert(out.includes(PROFILE_REDIRECT_SENTENCES.equipment.fr));
});

// ===========================================================================
// 5. LA JOINTURE AVEC LA MATRICE — le renvoi remplace un producteur RETIRÉ
// ===========================================================================

Deno.test("⛔ le chat ne produit AUCUNE famille — la prémisse du renvoi", () => {
  // C'EST LA PRÉMISSE DE TOUT CE MODULE. Si une seule cellule de la ligne ③
  // rouvrait, ces phrases mentiraient dans l'autre sens: elles diraient « je
  // n'ai pas enregistré » pendant que le magasin se remplirait.
  for (const kind of RETAINED_KINDS) {
    assertEquals(
      canProduce("conversation", kind),
      false,
      `la ligne ③ s'est rouverte sur ${kind}: le renvoi devient un mensonge`,
    );
  }
});

Deno.test("⛔ aucun matcher maison dans ce module", () => {
  // « laitue » ≠ « lait », 12 faux positifs sur 12 mesurés dans ce dépôt. Ce
  // module lit un VERDICT (`detected` + `kind`), jamais un message. Un `RegExp`
  // qui apparaîtrait ici serait le début exact de la reconstruction.
  const source = Deno.readTextFileSync(
    new URL("./conversation_redirect.ts", import.meta.url),
  );
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
  assert(!/new RegExp\(/.test(code), "un matcher maison est apparu");
  assert(!/\.test\(/.test(code), "un matcher maison est apparu");
  assert(!/\.match\(/.test(code), "un matcher maison est apparu");
});
