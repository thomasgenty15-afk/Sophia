import { assertEquals } from "jsr:@std/assert@1";
import { ACTIVE_FLOW_STATE_TABLE } from "./active_flow_state.ts";

/**
 * LE DÉFAUT QUE CES DEUX GARDES EMPÊCHENT DE REVENIR.
 *
 * La garde 4 de `chat-inbound-v1` arme le cadre de reprise en écrivant
 * `temp_memory.__active_conversation_skill_v1`. Elle l'écrivait dans
 * `user_states` — une table qui **n'existe pas**. Tout le reste du dépôt lit et
 * écrit `user_chat_states`.
 *
 * Rien ne l'a vu, et c'est ça qui compte:
 *   - le client PostgREST ne throw pas sur une table absente, il rend
 *     `{ error }` — le `try/catch` autour n'a donc jamais été atteint;
 *   - `error` n'était pas lu, donc le bloc journalisait
 *     `keel_reengagement_resume_armed` à chaque réponse d'élève;
 *   - le client est non typé (`Db = any` par nécessité), donc `deno check` est
 *     muet par construction;
 *   - le reducer, lui, est pur et vert — il n'a simplement jamais été appelé.
 *
 * Le seul symptôme observable était l'ABSENCE du cadre, c'est-à-dire rien.
 */

const FUNCTIONS_ROOT = new URL("../../", import.meta.url);

async function sourceFiles(dir: URL): Promise<URL[]> {
  const found: URL[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const child = new URL(`${entry.name}${entry.isDirectory ? "/" : ""}`, dir);
    if (entry.isDirectory) found.push(...await sourceFiles(child));
    else if (entry.name.endsWith(".ts")) found.push(child);
  }
  return found;
}

Deno.test("aucune fonction edge n'ecrit dans `user_states` (la table n'existe pas)", async () => {
  const offenders: string[] = [];
  for (const file of await sourceFiles(FUNCTIONS_ROOT)) {
    if (file.pathname.endsWith("active_flow_state_table_guard_test.ts")) continue;
    const text = await Deno.readTextFile(file);
    // `user_chat_states` contient `_states` mais PAS `"user_states"`: le motif
    // est ancré sur les quotes, donc il ne peut pas confondre les deux noms.
    if (/\.from\(\s*["'`]user_states["'`]\s*\)/.test(text)) {
      offenders.push(file.pathname.split("/functions/")[1] ?? file.pathname);
    }
  }
  assertEquals(offenders, []);
});

/**
 * ⟳ 2026-09-09 — LE TEST S'EST RETOURNÉ: IL VÉRIFIAIT QUE ÇA ARME, IL VÉRIFIE
 * MAINTENANT QUE ÇA N'ARME PLUS.
 *
 * Le cadre de reprise ne possède plus aucun tour. `chat-inbound-v1` a perdu son
 * bloc d'armement (le pourquoi y est écrit, avec le cas mesuré sur poul), et
 * sans écrivain, un lecteur qui survivrait serait une trappe: un état résiduel
 * déjà en base avalerait encore un tour. D'où trois retraits, et ce test tient
 * le premier — celui sans lequel les deux autres ne servent à rien.
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT DE CHERCHER. Le fichier NOMME le flow
 * dans le pavé qui explique son retrait — c'est le but du pavé. Un `includes`
 * naïf lirait donc « ça arme encore » sur le texte même qui dit le contraire.
 * Ce dépôt a déjà payé cet audit-là (`caller-audit-must-strip-comments`).
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

Deno.test("chat-inbound-v1 n'arme PLUS le cadre de reprise", async () => {
  const inbound = await Deno.readTextFile(
    new URL("../../chat-inbound-v1/index.ts", import.meta.url),
  );
  const code = withoutComments(inbound);

  // ① Le pavé qui explique le retrait est TOUJOURS là: sans lui, la prochaine
  //    session rebranche le cadre en croyant réparer un oubli.
  assertEquals(
    inbound.includes("keel_reengagement_resume_v1"),
    true,
    "le pavé qui dit POURQUOI le cadre a été retiré a disparu",
  );
  // ② …et il ne reste QUE dans les commentaires.
  assertEquals(
    code.includes("keel_reengagement_resume_v1"),
    false,
    "chat-inbound-v1 arme de nouveau le cadre de reprise",
  );
  // ③ La fermeture de l'épisode, elle, RESTE. C'est elle qui empêche le verrou
  //    permanent par élève; la retirer avec l'armement serait le vrai dégât.
  assertEquals(
    code.includes("closeKeelReengagementEpisodeOnInbound"),
    true,
    "la fermeture de l'épisode est partie avec l'armement",
  );
  assertEquals(ACTIVE_FLOW_STATE_TABLE, "user_chat_states");
});
