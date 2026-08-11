// Le chargeur d'environnement du banc.
//
// `--env-file` de Deno ABANDONNE le fichier à la première valeur non quotée
// contenant un espace (mesuré: « Sofia on earth », index 6) — et tout ce qui
// suit, dont OPENAI_API_KEY, n'est jamais posé. Symptôme: un 401 qui ressemble
// à une clé invalide alors que la clé n'a simplement pas été lue.
export function loadEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let text = "";
  try {
    text = Deno.readTextFileSync(path);
  } catch {
    return out;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}
