import { assert, assertEquals } from "jsr:@std/assert@1";

/**
 * AUCUNE COPIE NE PROMET UNE RÉPONSE DU COACH — parce qu'aucun canal ne peut la
 * livrer.
 *
 * ── LA RÈGLE, ET POURQUOI ELLE EST LA PLUS VIOLÉE DU PROJET ──────────────────
 * `docs/keel/MODEL.md` : le coach écrit une doctrine et un programme pour toute
 * sa cohorte. Il n'existe **aucun canal 1:1 coach → élève**. Une phrase comme
 * « they will come back on it » met donc l'élève en attente de quelque chose qui
 * n'arrivera jamais — et l'attente est justement ce que le modèle produit
 * interdit : un écran vide doit rendre la main à l'élève, pas le faire patienter.
 *
 * ── CE QUE ÇA A DÉJÀ COÛTÉ ───────────────────────────────────────────────────
 * `renderer.ts` a porté « I have passed your question to them with exactly what
 * you told me — they will come back on it » jusqu'au 2026-08-06, où un run réel
 * l'a fait sortir sur une simple annonce de sortie au restaurant. Le défaut
 * était connu : `run.ts` porte un contournement qui réoriente la lane vers le
 * composeur quand une maladie est déclarée, et son commentaire cite
 * textuellement ce faux canal. Le contournement traitait un symptôme sur un
 * chemin ; la phrase, elle, sortait sur tous les autres.
 *
 * ── CE QUE CETTE GARDE EST, ET N'EST PAS ─────────────────────────────────────
 * Un scan de SOURCE, pas une analyse sémantique. Elle attrape la récidive
 * littérale, qui est la forme qu'a prise ce défaut deux fois. Elle n'attrape pas
 * une reformulation créative — pour ça il n'y a que la relecture, et le fait que
 * ce fichier existe pour la rappeler.
 *
 * Ce qui reste AUTORISÉ, et doit le rester : dire que la question est PARTIE
 * chez le coach. C'est vrai (`contract_change_requests`), c'est utile, et le
 * taire laisserait l'élève croire que sa question s'est perdue.
 */

/** Les tournures qui promettent un RETOUR vers l'élève. */
const FORBIDDEN_PROMISES = [
  "come back on it",
  "come back to you",
  "get back to you",
  "will reply",
  "will respond",
  "their answer",
  "wait for their",
  "reviendra vers toi",
  "te répondra",
  "te repondra",
  "attends sa réponse",
  "attends sa reponse",
] as const;

/**
 * Les renderers KEEL DÉTERMINISTES — ceux dont chaque phrase est une constante,
 * donc ceux où une promesse fausse est une décision d'écriture et pas une
 * dérive de modèle.
 */
const DETERMINISTIC_RENDERERS = [
  "./renderer.ts",
  "../keel_reengagement_resume/renderer.ts",
];

Deno.test("aucun renderer KEEL deterministe ne promet une reponse du coach", async () => {
  const offenders: string[] = [];
  for (const relative of DETERMINISTIC_RENDERERS) {
    const url = new URL(relative, import.meta.url);
    const text = (await Deno.readTextFile(url)).toLowerCase();
    for (const promise of FORBIDDEN_PROMISES) {
      // Les commentaires de ce dépôt CITENT le défaut pour l'expliquer, et ils
      // doivent pouvoir le faire. On ne regarde donc que les lignes qui portent
      // un littéral de chaîne, jamais celles qui commencent par `//` ou `*`.
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
        if (!/["'`]/.test(line)) continue;
        if (line.includes(promise)) {
          offenders.push(`${relative} :: « ${promise} » :: ${trimmed.slice(0, 90)}`);
        }
      }
    }
  }
  assertEquals(offenders, []);
});

Deno.test("FAUSSE PREMISSE: la garde mord vraiment sur la phrase d'origine", async () => {
  // Sans ce cas, le précédent passerait sur une liste vide, un mauvais chemin de
  // fichier, ou un filtre de commentaires trop large. C'est la différence entre
  // une garde et une ligne verte.
  const original =
    '  return `${opener} I have passed your question to them with exactly what ` +\n' +
    '    "you told me — they will come back on it. Nothing in your plan has " +\n';
  const caught = FORBIDDEN_PROMISES.some((p) =>
    original.toLowerCase().includes(p)
  );
  assert(caught, "la garde ne reconnait plus la phrase qu'elle existe pour interdire");
});

Deno.test("dire que la question est PARTIE chez le coach reste autorise", async () => {
  // La moitié vraie doit survivre: taire l'envoi laisserait l'eleve croire que
  // sa question s'est perdue.
  const rendered = await Deno.readTextFile(new URL("./renderer.ts", import.meta.url));
  assert(
    rendered.includes("Your question is with them now"),
    "le renderer ne dit plus que la question est partie",
  );
});
