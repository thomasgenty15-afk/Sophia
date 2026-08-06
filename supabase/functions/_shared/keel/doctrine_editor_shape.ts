/**
 * LA DOCTRINE STOCKÉE → LA FORME QUE L'ÉDITEUR SAIT AFFICHER.
 *
 * Extrait de `coach-doctrine-v1/index.ts` pour UNE raison, et elle est mesurée:
 * cette fonction a déjà rendu la provenance sur DEUX sections sur trois. Le
 * compteur du bouton publier passait de « 2 of 3 » à « 1 of 3 » au premier
 * rechargement — il annonçait une appropriation que le coach n'avait pas faite.
 * Le test qui l'aurait attrapé ne pouvait pas exister: la fonction vivait dans un
 * module qui appelle `Deno.serve` au chargement, donc l'importer démarrait un
 * serveur. Le test réécrivait le trajet à la main, et un trajet réécrit à la main
 * ne teste pas le trajet.
 *
 * ── POURQUOI ON NORMALISE EN snake_case ──────────────────────────────────
 * Deux écritures coexistent légitimement en base: `save` écrit verbatim ce que
 * l'éditeur envoie (`surface_forms`, `coach_answer`), et un seed ou un import
 * peut avoir écrit la forme camelCase que `parseCoachDoctrine` accepte aussi
 * (`f.surface_forms ?? f.surfaceForms`). Le parseur de l'agent tolère les deux;
 * l'ÉDITEUR, lui, ne lit qu'une seule forme.
 *
 * Renvoyer la forme camelCase telle quelle afficherait donc des champs VIDES sur
 * des données présentes — et le premier « enregistrer » les écraserait pour de
 * bon. On convertit, pour que ce que le coach voit soit ce qui est stocké.
 *
 * ⚠️ LA RÈGLE QUI VAUT POUR TOUT CHAMP AJOUTÉ À UNE ENTRÉE DE DOCTRINE:
 * il doit apparaître ICI **et** être admis par `parseCoachDoctrine`. Cet écran
 * RELIT la doctrine pour la modifier, et le premier « enregistrer » réécrit ce
 * qu'il a relu. Un champ que cette fonction laisse tomber est effacé de toutes
 * les entrées du coach, sans message, au premier retour sur son écran.
 *
 * PUR: aucune I/O, aucune horloge, aucun hasard.
 */

export function toEditorShape(row: Record<string, unknown>): Record<string, unknown> {
  const arr = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  const forms = (e: Record<string, unknown>): string[] => {
    const raw = e.surface_forms ?? e.surfaceForms;
    return Array.isArray(raw) ? raw.map((x) => String(x ?? "")).filter(Boolean) : [];
  };
  // LA PORTÉE FAIT L'ALLER-RETOUR, ET SON OUBLI SERAIT SILENCIEUX. À l'écran,
  // une croyance globale et une croyance ciblée se ressemblent — c'est le
  // marqueur qui les distingue, donc sa perte ne se devine pas.
  const scope = (e: Record<string, unknown>): string[] => {
    const raw = e.goal_scope ?? e.goalScope;
    return Array.isArray(raw) ? raw.map((x) => String(x ?? "")).filter(Boolean) : [];
  };
  /**
   * LA PROVENANCE FAIT L'ALLER-RETOUR, EXACTEMENT COMME LA PORTÉE.
   *
   * Même mécanique, même oubli silencieux: une `source` laissée tomber ici est
   * effacée de toutes les entrées au premier retour du coach — et le compteur
   * « ces lignes sont encore les nôtres » tomberait à zéro tout seul, en
   * annonçant une appropriation qui n'a pas eu lieu. C'est LE mensonge que ce
   * compteur existe pour éviter.
   */
  const starterSource = (e: Record<string, unknown>): "starter" | null =>
    String(e.source ?? "").trim() === "starter" ? "starter" : null;
  const foods = (row.foods ?? {}) as Record<string, unknown>;
  return {
    beliefs: arr(row.beliefs).map((b) => ({
      claim: String(b.claim ?? ""),
      rationale: b.rationale == null ? null : String(b.rationale),
      goal_scope: scope(b),
      source: starterSource(b),
    })),
    forbidden: arr(row.forbidden).map((f) => ({
      token: String(f.token ?? ""),
      surface_forms: forms(f),
      reason: f.reason == null ? null : String(f.reason),
      instead: f.instead == null ? null : String(f.instead),
      source: starterSource(f),
    })),
    vocabulary: arr(row.vocabulary).map((v) => ({
      term: String(v.term ?? ""),
      meaning: v.meaning == null ? null : String(v.meaning),
    })),
    arbitrations: arr(row.arbitrations).map((a) => ({
      situation: String(a.situation ?? ""),
      coach_answer: String(a.coach_answer ?? a.coachAnswer ?? ""),
      goal_scope: scope(a),
      // MESURÉ, pas supposé: cette ligne manquait, et le compteur passait de
      // 2/3 à 1/3 au premier rechargement. Les trois sections semées doivent
      // faire l'aller-retour, pas deux sur trois.
      source: starterSource(a),
    })),
    foods: {
      // Pas de `recommended`: « avec quoi je construis » vit sur
      // `/coach/protocol`, dans le vocabulaire fermé. Une ligne ancienne qui en
      // porte encore une n'est pas rendue à l'éditeur — donc le prochain
      // enregistrement la laisse tomber, ce qui est exactement le nettoyage
      // qu'on veut, et il est visible dans le diff de version.
      discouraged: arr(foods.discouraged).map((f) => ({
        term: String(f.term ?? ""),
        surface_forms: forms(f),
        reason: f.reason == null ? null : String(f.reason),
      })),
    },
    qa: arr(row.qa).map((q) => ({
      question: String(q.question ?? ""),
      answer: String(q.answer ?? ""),
    })),
    voice: (row.voice ?? {}) as Record<string, unknown>,
  };
}
