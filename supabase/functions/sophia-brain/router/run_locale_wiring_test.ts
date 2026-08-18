// W9/R3 — LE CÂBLAGE de la langue de réponse, pas son calcul.
//
// `_shared/keel/locale_test.ts` prouve que la chaîne de priorité CALCULE bien.
// Ces ceintures-ci prouvent qu'elle est BRANCHÉE au bon endroit, une seule
// fois, et qu'elle laisse une trace sur le fil. Les deux défauts que W9 a payés
// étaient tous les deux des défauts de câblage, pas de calcul:
//   - huit lanes appelaient `resolveResponseLocale({})` — le calcul était juste,
//     ses entrées étaient vides;
//   - seul `companion.ts` écrivait l'ancre — le calcul était juste, son
//     résultat n'était pas committé sur les tours possédés par une skill.
//
// D'où des ceintures qui lisent la SOURCE. C'est le même patron que
// `reengagement_io_test.ts` (qui vérifie l'ordre de deux appels dans le corps
// de `sendReengageNudge`): quand l'invariant porte sur « qui appelle quoi, et
// où », un test de comportement ne peut pas le voir.

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { fromFileUrl } from "https://deno.land/std@0.208.0/path/mod.ts";

// `fromFileUrl` et pas `.pathname`: le dépôt vit dans « Sophia 2 », et un
// `.pathname` rend l'espace en `%20` — chemin introuvable, test qui « échoue »
// pour une raison qui n'a rien à voir avec ce qu'il garde.
const FUNCTIONS_DIR = fromFileUrl(new URL("../../", import.meta.url)).replace(/\/$/, "");

/**
 * Blanchit commentaires ET chaînes, en gardant les sauts de ligne.
 *
 * Les deux, et pas seulement les commentaires: ce fichier PARLE de
 * `resolveResponseLocale({})` dans sa propre prose et dans celle des modules
 * qu'il scanne. Un audit d'appelants qui compte les mentions en commentaire
 * compte des morts pour des vivants — c'est la classe d'erreur que
 * `caller-audit-must-strip-comments` nomme, et elle rendrait CETTE ceinture
 * fausse dans le sens rassurant.
 */
function stripCommentsAndStrings(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "\n") {
      out += c;
      i++;
    } else if (c === "/" && next === "/") {
      while (i < n && source[i] !== "\n") {
        out += " ";
        i++;
      }
    } else if (c === "/" && next === "*") {
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += "  ";
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      // Une quote non refermée avant la fin de ligne n'est pas une quote
      // (le JS l'interdit hors template literal): c'est une apostrophe de
      // prose française. Sans ce garde, « c'est » avale la moitié du fichier.
      const quote = c;
      let j = i + 1;
      let closed = false;
      let spanned = 0;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === quote) {
          closed = true;
          break;
        }
        if (source[j] === "\n") {
          if (quote !== "`") break;
          spanned++;
        }
        j++;
      }
      if (!closed) {
        out += c;
        i++;
        continue;
      }
      out += quote + " ".repeat(Math.max(0, j - i - 1 - spanned)) +
        "\n".repeat(spanned) + quote;
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

async function* walkTs(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      yield* walkTs(full);
    } else if (entry.isFile && entry.name.endsWith(".ts")) {
      yield full;
    }
  }
}

function isTestFile(path: string): boolean {
  return /(_test|\.test)\.ts$/.test(path);
}

Deno.test("R3 — `resolveResponseLocale` n'a QU'UN appelant de production", async () => {
  // L'invariant central de W9: un seul décideur, chez le propriétaire du tour.
  // Il en a eu NEUF, dont huit qui passaient `{}`.
  //
  // Condition de désarmement: aucune tant qu'un composeur visible existe. Un
  // second appelant légitime n'existe pas — une lane qui a besoin de la langue
  // la REÇOIT (`SkillContext.response_locale`). Si ce test devient gênant,
  // c'est qu'on est en train de refaire le défaut.
  const callers: string[] = [];
  for await (const file of walkTs(FUNCTIONS_DIR)) {
    if (isTestFile(file)) continue;
    if (file.endsWith("/_shared/keel/locale.ts")) continue; // la définition
    const code = stripCommentsAndStrings(await Deno.readTextFile(file));
    if (/\bresolveResponseLocale\s*\(/.test(code)) {
      callers.push(file.slice(FUNCTIONS_DIR.length + 1));
    }
  }
  assertEquals(
    callers.sort(),
    ["sophia-brain/router/run.ts"],
    `Un seul module peut décider de la langue de réponse (R3). Trouvé: ${
      callers.join(", ")
    }`,
  );
});

Deno.test("R3 — le routeur RÉSOUT puis ANCRE, sur le chemin de tous les tours", async () => {
  // Le défaut mesuré: l'écriture de `conversation_locale` ne vivait que dans
  // `companion.ts`. Un tour possédé par une skill (safety, product_help,
  // weekly_review…) résolvait une langue et ne committait rien; au tour
  // suivant `persisted` relisait vide et le fil pouvait changer de langue.
  //
  // Vérifié en run réel le 2026-08-06 sur la stack locale: un tour
  // `response_owner=safety` (mode sentry, companion jamais appelé) laisse bien
  // `user_chat_states.temp_memory->>'conversation_locale' = 'en-US'`.
  //
  // Condition de désarmement: aucune. Déplacer l'écriture vers les chemins de
  // sortie serait légitime SI tous étaient couverts — il y en a huit, et c'est
  // précisément l'oubli qu'on répare.
  const code = stripCommentsAndStrings(
    await Deno.readTextFile(fromFileUrl(new URL("./run.ts", import.meta.url))),
  );
  const resolveAt = code.indexOf("resolveResponseLocale({");
  const persistAt = code.indexOf("withPersistedConversationLocale(");
  assert(resolveAt >= 0, "run.ts doit résoudre la locale de réponse");
  assert(
    persistAt >= 0,
    "run.ts doit ANCRER la locale sur le fil — sinon un tour possédé par une " +
      "skill ne committe rien et la langue oscille (R3)",
  );
  assert(
    persistAt > resolveAt,
    "l'ancrage doit suivre la résolution, pas la précéder",
  );
  // Adjacence: l'ancrage vit AVEC la résolution, pas dans une branche lointaine
  // qu'un futur `return` anticipé pourrait sauter.
  const between = code.slice(resolveAt, persistAt);
  assert(
    !/\breturn\b/.test(between),
    "aucun `return` ne doit pouvoir s'intercaler entre la résolution et " +
      "l'ancrage: ce serait un chemin de sortie sans ancre",
  );
});

Deno.test("R3 — aucune lane ne code une locale de réponse en dur", async () => {
  // Le pendant du test précédent: on peut avoir un seul appelant de
  // `resolveResponseLocale` ET des lanes qui contournent en écrivant "en-US"
  // dans un appel de bloc de langue. C'est ce que faisait `keelOutageTemplate`
  // par son paramètre optionnel.
  const offenders: string[] = [];
  for await (const file of walkTs(FUNCTIONS_DIR)) {
    if (isTestFile(file)) continue;
    if (file.endsWith("/_shared/keel/locale.ts")) continue;
    const code = await Deno.readTextFile(file);
    const stripped = stripCommentsAndStrings(code);
    // On cherche un littéral de locale passé DIRECTEMENT à un bloc de langue.
    // Les chaînes étant blanchies, on relit la source brute mais uniquement sur
    // les lignes que le strip a laissées non vides (donc du vrai code).
    const rawLines = code.split("\n");
    stripped.split("\n").forEach((line, idx) => {
      if (!line.trim()) return;
      const raw = rawLines[idx] ?? "";
      if (
        /append(Response|Content)LanguageBlock\([^)]*["'](en|fr)-[A-Z]{2}["']/
          .test(raw)
      ) {
        offenders.push(`${file.slice(FUNCTIONS_DIR.length + 1)}:${idx + 1}`);
      }
    });
  }
  assertEquals(
    offenders,
    [],
    `Une locale en dur passée à un bloc de langue contourne le point unique ` +
      `(R3). Sites: ${offenders.join(", ")}`,
  );
});

Deno.test(
  "R3 — la langue du CHAT vient de `profiles.locale`, jamais de `student_goals`",
  async () => {
    // ── POURQUOI CETTE CEINTURE EXISTE ──────────────────────────────────────
    //
    // `KeelTurnContext.content_locale` porte un nom qui MENT à moitié. Il y a
    // deux colonnes `content_locale` dans ce produit et elles ne disent pas la
    // même chose:
    //
    //   · `profiles.locale`               — la langue que la personne a CHOISIE
    //                                       à l'inscription. C'est elle que
    //                                       l'agent doit parler.
    //   · `student_goals.content_locale`  — la langue dans laquelle elle a écrit
    //                                       SA SITUATION. Troisième axe de R3,
    //                                       et tous ses écrivains la sèment
    //                                       `'en-GB'`.
    //
    // Le champ du contexte de tour s'appelle `content_locale` et vient de la
    // PREMIÈRE. Rien, dans le nom, ne l'empêche de se mettre à venir de la
    // seconde: le type est le même, les tests de comportement passeraient, et
    // l'effet serait qu'un francophone se ferait répondre en anglais pour
    // toujours — le défaut exact que les générateurs portaient avant d'être
    // câblés.
    //
    // C'est aussi le maillon serveur de la chaîne que
    // `frontend/src/keel/i18n/signupLanguageChain.int.test.ts` tient côté front:
    //     champ « Langue » -> profiles.locale -> ICI -> resolveResponseLocale
    const source = await Deno.readTextFile(
      `${FUNCTIONS_DIR}/sophia-brain/router/run.ts`,
    );
    const code = stripCommentsAndStrings(source);

    // 1. La valeur est lue sur la ligne `profiles`, pas ailleurs.
    assert(
      /const\s+contentLocale\s*=\s*String\(\s*profileRow\?\.locale/.test(code),
      "`contentLocale` ne se lit plus sur `profileRow.locale` — la langue du " +
        "chat a changé de source",
    );

    // 2. Elle n'est jamais reprise depuis la table des objectifs.
    assert(
      !/goalRow\??\.content_locale/.test(code),
      "`run.ts` lit `content_locale` sur une ligne `student_goals`: c'est la " +
        "langue dans laquelle l'élève a écrit sa situation, pas celle qu'il " +
        "veut qu'on lui parle",
    );

    // 3. Et c'est bien elle qui entre dans le résolveur, sur l'entrée profil.
    assert(
      /studentProfile:\s*keelTurn\.content_locale/.test(code),
      "`resolveResponseLocale` ne reçoit plus la locale du profil en " +
        "`studentProfile`",
    );
  },
);
