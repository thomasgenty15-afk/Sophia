/**
 * KEEL — LE MODÈLE QUI COMPOSE, distinct de celui qui converse.
 *
 * ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
 * Jusqu'ici, composer une semaine entière de repas — doctrine, contraintes
 * dures, absences, rythme, plafonds, liste de courses, le tout en JSON
 * structuré — se faisait sur `GLOBAL_AI_MODEL`, dont le défaut est
 * `gpt-5.4-mini` (`_shared/gemini.ts`). Le même modèle que pour répondre
 * « ok, noté » dans un chat.
 *
 * Ce n'est pas la même tâche. Une génération de plan tient une trentaine de
 * contraintes SIMULTANÉES dont beaucoup sont NÉGATIVES (« rien mardi midi »,
 * « jamais cet aliment »), et une contrainte négative est précisément ce qu'un
 * modèle de composition a le plus tendance à compléter — c'est son métier de
 * remplir. C'est le seul endroit du produit où la capacité du modèle se paie
 * en assiettes fausses plutôt qu'en tournure maladroite.
 *
 * ── LA SOUPAPE, ET POURQUOI ELLE N'EST PAS DU CONFORT ──────────────────────
 * `gemini.ts` a une chaîne de repli — mais elle NE S'APPLIQUE PAS à un modèle
 * OpenAI choisi par l'appelant: `pickModelForAttempt` finit par
 * « Otherwise keep caller-selected model ». Autrement dit, si l'identifiant
 * ci-dessous n'existe pas côté fournisseur, chaque tentative retape le même
 * identifiant mort et TOUTE génération échoue — sans repli, silencieusement,
 * pour tous les élèves.
 *
 * D'où la variable d'environnement: elle permet de revenir en arrière **sans
 * redéploiement**. Poser `KEEL_GENERATION_MODEL=gpt-5.4-mini` restaure
 * exactement le comportement d'avant. C'est le seul geste de retour arrière
 * qui ne demande pas de toucher au code, et sur un chemin sans repli c'est
 * exactement ce qu'il faut.
 *
 * ── CE QUE CE MODULE NE FAIT PAS ───────────────────────────────────────────
 * Il ne touche PAS `GLOBAL_AI_MODEL`. Le chat, le memorizer, les flows et tout
 * le reste gardent leur modèle. Changer le défaut global aurait déplacé le
 * coût et la latence de toutes les surfaces pour un besoin qui n'existe que
 * sur trois fonctions de génération.
 */

function safeEnvGet(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

/**
 * Le modèle des fonctions de génération, quand rien ne le surcharge.
 *
 * ⚠️ VÉRIFIE CET IDENTIFIANT CHEZ LE FOURNISSEUR avant de déployer. Voir la
 * note sur l'absence de repli en tête de fichier: un identifiant invalide ici
 * ne dégrade pas le produit, il l'arrête.
 */
export const KEEL_GENERATION_MODEL_DEFAULT = "gpt-5.6-sol";

/**
 * Le modèle à passer dans `meta.model` d'un appel `generateWithGemini` fait
 * par une fonction de COMPOSITION (repas, semaine, foyer).
 *
 * Lu à chaque appel, jamais mis en cache dans un module: une variable
 * d'environnement changée doit prendre effet au prochain appel, pas au
 * prochain démarrage d'isolat — c'est ce qui fait d'elle un retour arrière.
 */
export function keelGenerationModel(): string {
  const override = (safeEnvGet("KEEL_GENERATION_MODEL") ?? "").trim();
  return override || KEEL_GENERATION_MODEL_DEFAULT;
}
