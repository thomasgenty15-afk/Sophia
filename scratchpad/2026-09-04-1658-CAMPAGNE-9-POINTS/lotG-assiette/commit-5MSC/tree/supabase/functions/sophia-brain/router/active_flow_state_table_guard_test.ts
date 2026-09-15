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

Deno.test("l'ecrivain du cadre de reprise passe par la constante partagee", async () => {
  const inbound = await Deno.readTextFile(
    new URL("../../chat-inbound-v1/index.ts", import.meta.url),
  );
  // Il ARME (le bloc existe)…
  assertEquals(
    inbound.includes("keel_reengagement_resume_v1"),
    true,
    "la garde 4 n'arme plus le cadre de reprise",
  );
  // …et il le fait par la constante, jamais par un littéral. Écrivain et
  // lecteur se trompent alors ENSEMBLE, ce qui rend l'erreur visible.
  assertEquals(
    inbound.includes("ACTIVE_FLOW_STATE_TABLE"),
    true,
    "la garde 4 nomme une table en dur au lieu d'importer la constante",
  );
  assertEquals(ACTIVE_FLOW_STATE_TABLE, "user_chat_states");
});
