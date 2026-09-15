/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT F ② — L'ADAPTATEUR FOURNISSEUR CONTRÔLÉ, AU NIVEAU TRANSPORT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le plan (« Lot F », point 2) : « utiliser un adaptateur fournisseur contrôlé
 * au niveau transport sur une pile de test, ou extraire le service de
 * traitement derrière le vrai handler pour injecter ce transport. Aller jusqu'à
 * la sérialisation, l'écriture de fixtures et leur relecture par les lecteurs
 * API/UI. »
 *
 * ⛔ « AUCUN INTERRUPTEUR DE CONTOURNEMENT EXPOSÉ AUX REQUÊTES DE PRODUCTION. »
 * C'est la garde dure du point 2, et c'est ce module qui la tient :
 *
 *   · RIEN n'est ajouté à `supabase/functions/**`. Aucune branche du produit ne
 *     sait que ce fichier existe. Une requête HTTP ordinaire — celle que Kong
 *     sert depuis `functions serve` — ne peut donc PAS obtenir une réponse en
 *     conserve : le chemin qui la servirait n'existe que dans CE processus.
 *   · Le seul point d'injection est `globalThis.fetch`, dans le processus du
 *     banc, avant l'import du handler. C'est le transport, pas un drapeau.
 *   · `Deno.serve` est capturé pour RÉCUPÉRER le handler, pas pour ouvrir un
 *     port : le banc n'écoute sur rien. Il n'y a aucune adresse à atteindre.
 *
 * ── CE QUI N'EST PAS UN CONTOURNEMENT NON PLUS, ET POURQUOI ON NE S'EN SERT PAS
 *
 * `_shared/gemini.ts` porte déjà `MEGA_TEST_MODE` (l. ~420) : dès que la pile
 * est locale, il rend `MEGA_TEST_STUB: <200 premiers caractères du message>`.
 * C'est un stub de **disponibilité** — il prouve que la fonction répond sans
 * clé d'API. Le parseur de plan le REJETTE (ce n'est pas du JSON de plan), donc
 * il ne prouve RIEN du parcours de composition. Ce banc ne l'utilise pas :
 * `MEGA_TEST_MODE=0` est posé explicitement, la vraie branche fournisseur est
 * prise, et c'est le TRANSPORT qui rend la réponse archivée.
 *
 * ── LA GARDE DE DÉPENSE ───────────────────────────────────────────────────
 *
 * Tout `fetch` sortant vers un hôte qui n'est ni la pile locale ni un
 * fournisseur intercepté **jette**. Un banc qui laisserait passer un appel réel
 * ne serait pas « un banc un peu cher » : ce serait un banc dont les nombres ne
 * viennent plus de la fixture. On préfère un rouge bruyant.
 */

// ── LA PILE ET LES CLÉS, LUES DANS `supabase/.env` ────────────────────────
//
// ⛔ AUCUNE VALEUR N'EST ÉCRITE DANS CE FICHIER. Le banc lit le même fichier
// que `functions serve`, pour que « le handler du banc » et « le handler servi »
// aient la même configuration. Un banc configuré à part mesure un autre moteur.
export function loadDotEnv(path: string): Record<string, string> {
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
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * C0 ⑤ — L'HORLOGE, INJECTÉE AU NIVEAU DU HARNAIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le plan de clôture : « Pour le transport contrôlé, injecter l'horloge et les
 * identifiants de fixture au niveau du harness, SANS interrupteur accessible
 * depuis une requête produit. Les tests d'après-midi ne doivent pas dépendre de
 * l'heure réelle de lancement. »
 *
 * ⛔ RIEN N'EST AJOUTÉ SOUS `supabase/functions/**`, et c'est la même garde que
 * `installControlledTransport` : le handler lit l'heure par `new Date()`
 * (`index.ts:1994-2008` — `dayTokenInZone`, `localDateInZone`,
 * `localMinuteInZone`), et on remplace `Date` DANS LE PROCESSUS DU BANC, avant
 * d'importer le handler. Aucune requête HTTP ne peut atteindre ce chemin : il
 * n'existe pas dans le processus que Kong sert.
 *
 * ⛔ POURQUOI ÇA COMPTE. Le cas n° 1 du plan demandait « une fenêtre commençant
 * l'après-midi ». Les six tirs sont partis entre 19 h 59 et 20 h 13 : passé la
 * coupure des courses de 18 h, le premier jour tombe ENTIER. Le cas n'a donc
 * jamais été mesuré, et le rapport le dit. Sans horloge injectable, le rejouer
 * demande d'attendre un humain entre 12 h et 17 h — c'est-à-dire de ne jamais
 * le rejouer.
 *
 * ⚠️ CE QUE ÇA NE DÉPLACE PAS : l'authentification. `getUser()` est un appel
 * RÉSEAU à GoTrue, qui garde SON horloge ; un jeton émis il y a une minute
 * reste valide même si le banc se croit demain. Vérifié sur la pile locale.
 *
 * ⚠️ ET L'HORLOGE NE S'INSTALLE PAS « un peu » : `Date.now()` et
 * `new Date()` bougent ENSEMBLE. Deux horloges dans le même processus
 * rendraient un premier jour retiré par l'une et gardé par l'autre.
 */
export function installerHorloge(iso: string): {
  cible: Date;
  decalageMs: number;
  restore(): void;
} {
  const cible = new Date(iso);
  if (Number.isNaN(cible.getTime())) {
    throw new Error(
      `⛔ horloge illisible : « ${iso} ». Attendu un instant ISO complet avec ` +
        `son décalage, par exemple 2026-09-12T14:00:00+02:00.`,
    );
  }
  const VraieDate = Date;
  const decalageMs = cible.getTime() - VraieDate.now();
  // deno-lint-ignore no-explicit-any
  class DateDuBanc extends (VraieDate as any) {
    // deno-lint-ignore no-explicit-any constructor-super
    constructor(...args: any[]) {
      if (args.length === 0) super(VraieDate.now() + decalageMs);
      else super(...args);
    }
    static now(): number {
      return VraieDate.now() + decalageMs;
    }
  }
  // deno-lint-ignore no-explicit-any
  (globalThis as any).Date = DateDuBanc;
  return {
    cible,
    decalageMs,
    restore() {
      // deno-lint-ignore no-explicit-any
      (globalThis as any).Date = VraieDate;
    },
  };
}

export interface CannedExchange {
  /** `generate-household-meal-v1` ou `…​.composition_fill` */
  readonly source: string;
  /** Le modèle nommé par l'archive — sert à router, jamais à décider. */
  readonly model: string;
  /** Le texte EXACT rendu par le fournisseur, avant tout parseur du moteur. */
  readonly outputText: string;
  /** Le prompt système archivé — sert d'empreinte de routage. */
  readonly systemPrompt: string;
}

/**
 * ⚠️ LE RETAILLAGE — CE QU'IL FAIT, ET CE QU'IL NE FAUT PAS LUI FAIRE DIRE.
 *
 * Les deux réponses archivées ont été composées le 2026-09-11 à **15 h 07**
 * locales, sur une grille de **7 cases** : `fri/dinner` + samedi ×3 + dimanche
 * ×3. Rejouées le soir (mesuré à **19 h 42**), la grille du produit n'a plus que
 * **6 cases** : le vendredi entier tombe par `spent_first_day_dropped: fri
 * (shopping_cutoff)`. Le premier tir du banc l'a montré en clair — 422
 * `mouth_unfed` sur `sun/dinner`, parce que le plafond de 6 plats jetait le 7ᵉ.
 *
 * ⛔ CE N'EST PAS UN DÉFAUT DU MOTEUR, ET CE N'EST PAS NON PLUS UN DÉTAIL À
 * TAIRE : c'est la preuve que l'heure locale décide de la grille, et que la
 * fixture ne fige pas l'heure. Le retaillage retire **la case que la grille
 * d'aujourd'hui n'a pas**, et rien d'autre :
 *
 *   · le plat du jour retiré, et sa ligne de `member_portions` ;
 *   · sa séance de cuisine est **déplacée**, jamais supprimée — `prep_chicken`
 *     est cuisiné le vendredi et mangé le samedi matin : la jeter orphelinerait
 *     une préparation que les six plats restants emploient.
 *
 * ⛔ AUCUN GRAMME, AUCUN INGRÉDIENT, AUCUNE MÉTHODE, AUCUNE LISTE DE COURSES
 * N'EST TOUCHÉE. Ce qui est mesuré ensuite reste la réponse du modèle du
 * 2026-09-11 — moins une case que la journée d'aujourd'hui ne demande pas.
 */
export function retaillerReponse(
  outputText: string,
  args: { dropDays: readonly string[]; moveCookingTo: string },
): { text: string; dishesBefore: number; dishesAfter: number; moved: string[] } {
  const plan = JSON.parse(outputText) as Record<string, unknown>;
  const dishes = Array.isArray(plan.dishes) ? plan.dishes as Record<string, unknown>[] : [];
  const drop = new Set(args.dropDays);
  const before = dishes.length;
  plan.dishes = dishes.filter((d) => !drop.has(String(d.day ?? "")));
  const portions = Array.isArray(plan.member_portions)
    ? plan.member_portions as Record<string, unknown>[]
    : [];
  plan.member_portions = portions.filter((p) => !drop.has(String(p.day ?? "")));
  const sessions = Array.isArray(plan.cooking_sessions)
    ? plan.cooking_sessions as Record<string, unknown>[]
    : [];
  const moved: string[] = [];
  const kept: Record<string, unknown>[] = [];
  for (const s of sessions) {
    const day = String(s.day ?? "");
    if (!drop.has(day)) {
      kept.push(s);
      continue;
    }
    const ids = Array.isArray(s.preparation_ids) ? s.preparation_ids as string[] : [];
    moved.push(...ids);
    const target = kept.find((k) => String(k.day ?? "") === args.moveCookingTo);
    if (target) {
      const existing = Array.isArray(target.preparation_ids)
        ? target.preparation_ids as string[]
        : [];
      target.preparation_ids = [...new Set([...ids, ...existing])];
      target.total_minutes = Number(target.total_minutes ?? 0) +
        Number(s.total_minutes ?? 0);
      target.run_through = `${String(s.run_through ?? "")} ${String(target.run_through ?? "")}`
        .trim();
    } else {
      kept.push({ ...s, day: args.moveCookingTo });
    }
  }
  plan.cooking_sessions = kept;
  return {
    text: JSON.stringify(plan),
    dishesBefore: before,
    dishesAfter: (plan.dishes as unknown[]).length,
    moved,
  };
}

export interface TransportCall {
  readonly url: string;
  readonly model: string;
  readonly matched: string | null;
  readonly bodyBytes: number;
  readonly atMs: number;
}

export interface ControlledTransport {
  /** Les appels fournisseur interceptés, dans l'ordre. */
  readonly calls: TransportCall[];
  /**
   * ⟳ 2026-09-12 · ÉTAPE C4 — LES CORPS JSON RÉELLEMENT ENVOYÉS, dans l'ordre.
   *
   * ⛔ SANS EUX, « la consigne est-elle partie ? » N'A PAS DE RÉPONSE au banc:
   * `calls` ne portait que `bodyBytes`. Une consigne écrite, câblée, et jamais
   * lue par personne est la cicatrice « ceinture armée sur coffre vide ».
   */
  readonly prompts: string[];
  /**
   * ⟳ 2026-09-13 · LOT 3 §3.3 — LES APPELS RÉELLEMENT FACTURÉS.
   *
   * ⛔ VIDE = ZÉRO DÉPENSE, et c'est le cas par défaut. Non vide, chaque entrée
   * est un aller-retour payé : le rapport doit les compter séparément des
   * appels interceptés, sans quoi « trois appels » ne distingue plus un banc
   * gratuit d'une campagne facturée.
   */
  readonly realCalls: {
    turn: number;
    status: number;
    ms: number;
    bytes: number;
    /** ⛔ La réponse BRUTE du fournisseur. Exigée par le plan §3.4. */
    body: string;
  }[];
  /** Les hôtes refusés (aucun n'est attendu). */
  readonly refused: string[];
  restore(): void;
}

/**
 * Le routage est une DÉCISION NOMMÉE, pas une heuristique de ressemblance.
 *
 * ⛔ ON NE COMPARE PAS LE PROMPT ENVOYÉ AU PROMPT ARCHIVÉ. Les deux diffèrent
 * forcément : la date du jour, l'heure locale, les identifiants de bouche et le
 * catalogue ont bougé depuis le 2026-09-11 15 h. Un routage par ressemblance
 * rendrait « la mauvaise réponse » sur un écart d'un caractère, et surtout il
 * ferait croire que le prompt n'a pas changé. On route donc sur le MODÈLE
 * DEMANDÉ, qui est la seule chose que l'appelant choisit explicitement :
 *
 *   · `gpt-5.6-luna`  → la composition        (`keelGenerationModel()`)
 *   · tout le reste   → `composition_fill`    (`gpt-5.4-nano` dans l'archive)
 *
 * Et on COMPTE les appels par nature : c'est le « coût : appels réels par
 * nature » que le tableau du plan réclame.
 */
/**
 * ⟳ 2026-09-14 · BÊTA 2B — LES QUATRE PANNES QU'UN FOURNISSEUR PEUT RENDRE.
 *
 * ⚠️ CHACUNE EST UNE FAMILLE DIFFÉRENTE, ET LE PRODUIT N'A AUCUNE RAISON DE
 * LES TRAITER PAREIL:
 *   · `rate_limited` — 429: il reviendra, plus tard;
 *   · `server_error` — 5xx du fournisseur: il ne reviendra peut-être pas;
 *   · `invalid_body` — 200 avec un corps que le lecteur ne sait pas lire. Le
 *     pire des trois: tout a l'air d'aller;
 *   · `connection_cut` — la connexion tombe, `fetch` jette.
 */
export type ProviderFault =
  | { readonly kind: "rate_limited" }
  | { readonly kind: "server_error"; readonly status: number }
  | { readonly kind: "invalid_body" }
  | { readonly kind: "connection_cut" };

export function installControlledTransport(args: {
  readonly compositionModel: string;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-13 · LOT 3 — LES MODÈLES DE REPLI DU FOURNISSEUR
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE DÉFAUT, PAYÉ EN VRAI LE 2026-09-13. Le routage se fait sur le NOM DU
   * MODÈLE : `gpt-5.6-luna` ⇒ composition, tout le reste ⇒ remplissage. Quand
   * un appel RÉEL de réparation a échoué, la chaîne de repli du fournisseur a
   * basculé (`[Gemini] Switching model (fallback) gpt-5.6-luna -> gpt-5.6-sol`)
   * et le transport a servi la conserve du REMPLISSAGE — `{"items":[]}` — à une
   * réparation. Rejet `base_version_missing`, un appel facturé, rien de mesuré,
   * et la trace ressemblait à une mauvaise réponse du modèle.
   *
   * ⛔ CE QUE LE PLAN EXIGE EN TOUTES LETTRES (§ 3.2) : « vérifier dans la trace
   * qu'une reprise du transport contrôlé après le plafond réel n'est jamais
   * présentée comme une deuxième réussite du modèle ». Un repli silencieux est
   * la même faute, un cran plus tôt.
   *
   * ⚠️ Vide = aucun repli connu, et le comportement d'avant ce lot.
   */
  readonly compositionFallbackModels: readonly string[];
  readonly composition: CannedExchange;
  readonly fill: CannedExchange;
  /** Hôtes de la pile locale, laissés passer vers le vrai réseau. */
  readonly passThroughHosts: readonly string[];
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-12 · ÉTAPE C3 — UNE RÉPONSE PAR TOUR, POUR EXERCER LES
   *                RÉPARATIONS
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ POURQUOI ELLE MANQUAIT, ET CE QUE ÇA EMPÊCHAIT DE MESURER. Le routage
   * sert la MÊME réponse à tous les appels du modèle de composition : une
   * relance recevait donc le plan qu'elle venait d'envoyer, l'épissage ne
   * remplaçait rien, et le chemin qui JETAIT six lignes de courses n'était
   * jamais exercé par le banc. Le plan de clôture l'exige en toutes lettres :
   * « tester après UNE puis DEUX réparations » — « c'est la condition la plus
   * facile à sauter et la plus utile : le défaut naît d'une réparation ».
   *
   * Le Nᵉ appel au modèle de composition sert `compositionSequence[N]` ; passé
   * la fin de la liste, c'est la DERNIÈRE qui se répète. Absente, tout se
   * comporte exactement comme avant — `composition.outputText` partout.
   *
   * ⚠️ CE N'EST PAS UNE DÉPENSE : les réponses sont en conserve, écrites par le
   * banc. Zéro appel modèle facturé, comme le reste de ce fichier.
   */
  readonly compositionSequence?: readonly string[];
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-12 · FERMETURE LOT 1 — LA RÉPONSE DE RÉPARATION EST UN PATCH
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ POURQUOI CE CROCHET EXISTE. Depuis la fermeture du lot 1, une réparation
   * ne rend plus un PLAN mais un PATCH : `{repair:{base_version, units:[{unit_id,
   * …}]}}`, et les `unit_id` autorisés ne sont connus QU'AU MOMENT DE L'APPEL —
   * ils sont écrits dans la consigne que le handler vient de composer. Une
   * séquence de textes écrite à l'avance ne peut donc pas les citer.
   *
   * ⛔ ET C'EST BIEN CE QU'ON VEUT ÉPROUVER. Servir un plan entier à une
   * réparation ferait passer le banc à côté de tout le lot : l'enveloppe serait
   * rejetée (`empty_patch`) et on mesurerait un refus, pas une réparation.
   *
   * Le crochet reçoit la consigne ENVOYÉE et le rang de l'appel ; il rend le
   * texte à servir, ou `null` pour laisser la séquence décider. Zéro dépense :
   * c'est du texte fabriqué localement.
   */
  readonly compositionPatch?: (args: {
    readonly prompt: string;
    readonly turn: number;
    readonly fallback: string;
  }) => string | null;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-13 · LOT 3 §3.3 — LA SORTIE RÉELLE, POUR LA RÉPARATION SEULE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ ELLE N'EXISTE QUE SI ON LA DEMANDE, ET ELLE COÛTE DE L'ARGENT. Absente
   * (`undefined`), le transport se comporte comme avant : toute sortie
   * fournisseur est interceptée, zéro dépense. Présente, elle rend `true` pour
   * les SEULS tours qu'on accepte de payer — et le premier jet (tour 0) n'en
   * fait jamais partie : un parcours HYBRIDE fige le premier jet et ne paie que
   * la réparation.
   *
   * ⛔ LE PLAFOND EST TENU ICI AUSSI, pas seulement par le handler. `realCap`
   * est le nombre maximal d'appels réellement laissés sortir ; au-delà, le
   * transport REPREND la main et sert la réponse en conserve, en le disant.
   * Un plafond qui ne vit que dans le code appelé est un plafond qu'un bug de
   * boucle contourne.
   *
   * ⚠️ ET LES HÔTES RESTENT UNE LISTE FERMÉE : `providerHosts` ci-dessous. Un
   * hôte inconnu jette, en mode réel comme en mode contrôlé.
   */
  readonly realTurns?: (turn: number) => boolean;
  /** Le nombre maximal d'appels réellement facturés. Requis si `realTurns`. */
  readonly realCap?: number;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-14 · BÊTA 2B — LA PANNE FOURNISSEUR, INJECTÉE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ CE QUE LE PLAN DE BÊTA EXIGE, ET QUI N'AVAIT JAMAIS ÉTÉ JOUÉ: « tester
   * erreur 546, 429, réponse fournisseur invalide, réseau coupé avant/après
   * écriture, rafraîchissement, double clic et deux onglets ». Six des sept
   * n'avaient aucune épreuve — et « le produit se comporte bien quand le
   * fournisseur tombe » était donc une affirmation, pas un fait.
   *
   * Le crochet reçoit le rang de l'appel et rend la panne à servir, ou `null`
   * pour laisser le transport répondre normalement. Zéro dépense.
   *
   * ⛔ CE QU'IL NE SAIT PAS SIMULER, ET IL FAUT LE DIRE: le **546**. Ce n'est
   * pas une réponse du fournisseur, c'est le worker edge TUÉ par sa limite de
   * CPU ou de mur — plus aucune ligne du handler ne s'exécute, ni `catch`, ni
   * `finally`. Aucun crochet de transport ne peut le produire; la seule parade
   * est la péremption du verrou (`p_stale_after`), et elle se vérifie en SQL.
   */
  readonly providerFault?: (args: {
    readonly turn: number;
    readonly isComposition: boolean;
  }) => ProviderFault | null;
}): ControlledTransport {
  const realFetch = globalThis.fetch;
  const calls: TransportCall[] = [];
  /** ⟳ LOT 3 §3.3 — ce qui a RÉELLEMENT été facturé, et ce que ça a coûté. */
  let reallySpent = 0;
  const realCalls: {
    turn: number;
    status: number;
    ms: number;
    bytes: number;
    body: string;
  }[] = [];
  const prompts: string[] = [];
  /** ⟳ C3 — le rang de l'appel au modèle de COMPOSITION (0 = premier jet). */
  let compositionTurn = 0;
  const refused: string[] = [];
  const t0 = Date.now();

  const providerHosts = new Set([
    "api.openai.com",
    "generativelanguage.googleapis.com",
  ]);

  const adapter: typeof fetch = async (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      host = "";
    }

    if (args.passThroughHosts.includes(host)) {
      return await realFetch(input as RequestInfo, init);
    }

    if (!providerHosts.has(host)) {
      // ⛔ ET ON JETTE. Un hôte inconnu qui passerait en silence ferait d'un
      // banc « hors dépense » un banc dont personne ne connaît la facture.
      refused.push(host || url);
      throw new Error(
        `LOT F — transport contrôlé : sortie REFUSÉE vers « ${host || url} ». ` +
          `Seuls la pile locale (${args.passThroughHosts.join(", ")}) et les ` +
          `fournisseurs interceptés sont permis.`,
      );
    }

    // ⚠️ `RequestInit` a plusieurs formes dans les bibliothèques de ce dépôt
    // (Deno, DOM, client HTTP) et `body` n'est pas déclaré sur toutes. On lit
    // le champ par un accès indexé plutôt que de perdre le typecheck du banc.
    const rawInit = (init ?? {}) as Record<string, unknown>;
    const rawBody = typeof rawInit.body === "string" ? rawInit.body : "";
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch { /* un corps illisible reste routé par défaut sur le remplissage */ }
    const model = String(payload?.model ?? "").trim();

    // ⟳ 2026-09-13 · LOT 3 — LE REPLI EST DE LA COMPOSITION, PAS DU REMPLISSAGE.
    // Voir le pavé sur `compositionFallbackModels`.
    const estRepli = args.compositionFallbackModels.includes(model);
    const isComposition = model === args.compositionModel || estRepli;
    if (estRepli) {
      console.warn(
        `   ⚠️ REPLI FOURNISSEUR : ${args.compositionModel} → ${model}. ` +
          `L'appel précédent a ÉCHOUÉ. Ce tour est routé comme une ` +
          `composition, pas comme un remplissage — sans quoi une réparation ` +
          `recevrait la conserve « items:[] » et serait rejetée pour une ` +
          `raison qui n'est pas la sienne.`,
      );
    }
    // ── ⟳ 2026-09-13 · LOT 3 §3.3 — L'APPEL QU'ON ACCEPTE DE PAYER ─────────
    if (isComposition && args.realTurns !== undefined) {
      const cap = args.realCap ?? 0;
      if (args.realTurns(compositionTurn)) {
        if (reallySpent >= cap) {
          console.warn(
            `   ⛔ PLAFOND RÉEL ATTEINT (${cap}) — le tour ${compositionTurn} ` +
              `repasse en conserve. Aucune reprise silencieuse.`,
          );
        } else {
          reallySpent++;
          const depart = Date.now();
          console.warn(
            `   💸 APPEL RÉEL #${reallySpent}/${cap} (tour ${compositionTurn}, ` +
              `modèle ${model}, ${rawBody.length} o) — il est FACTURÉ.`,
          );
          prompts.push(rawBody);
          const vraie = await realFetch(input as RequestInfo, init);
          const corps = await vraie.clone().text().catch(() => "");
          calls.push({
            url,
            model,
            matched: `REEL:${compositionTurn}`,
            bodyBytes: rawBody.length,
            atMs: Date.now() - t0,
          });
          realCalls.push({
            turn: compositionTurn,
            status: vraie.status,
            ms: Date.now() - depart,
            bytes: corps.length,
            // ⛔ LA RÉPONSE BRUTE EST GARDÉE, ET C'EST UNE EXIGENCE DU PLAN
            // (§3.4) : « réponse brute de chaque réparation ». Sans elle, un
            // rejet ne se diagnostique pas — on ne saurait pas si le modèle a
            // mal répondu ou si le contrat lui a mal demandé.
            body: corps,
          });
          console.warn(
            `   💸 retour réel : ${vraie.status} en ${Date.now() - depart} ms, ` +
              `${corps.length} o`,
          );
          compositionTurn++;
          return vraie;
        }
      }
    }
    // ── ⟳ 2026-09-14 · BÊTA 2B — LA PANNE, AVANT TOUTE RÉPONSE ────────────
    //
    // ⛔ ELLE PASSE APRÈS L'APPEL RÉEL ET AVANT LA CONSERVE: injecter une panne
    // sur un tour qu'on paie ferait jeter une réponse facturée, et le compteur
    // de dépense mentirait sur ce qu'on a obtenu.
    if (args.providerFault !== undefined) {
      const panne = args.providerFault({ turn: compositionTurn, isComposition });
      if (panne !== null) {
        calls.push({
          url,
          model,
          matched: `PANNE:${panne.kind}`,
          bodyBytes: rawBody.length,
          atMs: Date.now() - t0,
        });
        if (isComposition) compositionTurn++;
        console.warn(`   ⚡ PANNE INJECTÉE : ${panne.kind} (tour ${compositionTurn - 1})`);
        if (panne.kind === "connection_cut") {
          throw new TypeError("error sending request: connection closed before message completed");
        }
        if (panne.kind === "invalid_body") {
          // ⛔ 200 AVEC UN CORPS ILLISIBLE. Le cas le plus traître: rien dans
          // le statut ne dit que ça s'est mal passé.
          return new Response("<html>502 Bad Gateway</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        }
        const status = panne.kind === "rate_limited" ? 429 : panne.status;
        return new Response(
          JSON.stringify({
            error: {
              message: panne.kind === "rate_limited"
                ? "Rate limit reached for requests"
                : "The server had an error processing your request",
              type: panne.kind === "rate_limited" ? "rate_limit_error" : "server_error",
            },
          }),
          { status, headers: { "content-type": "application/json" } },
        );
      }
    }
    const canned = isComposition ? args.composition : args.fill;
    // ⟳ C3 — LE TOUR DÉCIDE DU TEXTE, quand une séquence est donnée.
    let outputText = canned.outputText;
    if (isComposition) {
      const seq = args.compositionSequence ?? [];
      if (seq.length > 0) {
        outputText = seq[Math.min(compositionTurn, seq.length - 1)];
      }
      // ⟳ 2026-09-12 · FERMETURE LOT 1 — LE PATCH SE FABRIQUE SUR LA CONSIGNE
      // REÇUE, parce que les `unit_id` autorisés y sont écrits et nulle part
      // ailleurs. `null` = le crochet s'abstient, la séquence garde la main.
      if (args.compositionPatch !== undefined) {
        const patch = args.compositionPatch({
          prompt: rawBody,
          turn: compositionTurn,
          fallback: outputText,
        });
        if (patch !== null) outputText = patch;
      }
      compositionTurn++;
    }
    calls.push({
      url,
      model,
      matched: canned.source,
      bodyBytes: rawBody.length,
      atMs: Date.now() - t0,
    });
    // ⟳ 2026-09-12 · ÉTAPE C4 — LE CORPS ENVOYÉ, GARDÉ EN MÉMOIRE.
    //
    // ⛔ IL MANQUAIT, ET C'EST CE QUI RENDAIT « la consigne est-elle partie ? »
    // INVÉRIFIABLE AU BANC. `calls` ne portait que `bodyBytes`: on savait qu'un
    // appel avait eu lieu, jamais ce qu'il disait. Une consigne écrite, câblée,
    // et jamais lue par personne est exactement la cicatrice « ceinture armée
    // sur coffre vide » de ce dépôt.
    //
    // ⚠️ EN MÉMOIRE SEULEMENT, et le banc ne l'écrit que sur demande
    // (`--prompts`): un corps de 46 ko par appel dans chaque fixture de sortie
    // les ferait grossir de moitié pour une lecture qu'on fait rarement.
    prompts.push(rawBody);

    // La forme de l'API « Responses » d'OpenAI, telle que
    // `outputTextFromOpenAIResponse` la lit : `output_text` suffit.
    const body = {
      id: `resp_lotf_${calls.length}`,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      model,
      status: "completed",
      output_text: outputText,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
      service_tier: "priority",
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  globalThis.fetch = adapter;
  return {
    calls,
    /** ⟳ C4 — les corps JSON envoyés au fournisseur, dans l'ordre des appels. */
    prompts,
    /** ⟳ LOT 3 §3.3 — les appels RÉELLEMENT facturés. Vide = zéro dépense. */
    realCalls,
    refused,
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}

/**
 * Capture le handler que `Deno.serve` recevrait, SANS ouvrir de port.
 *
 * ⛔ C'est ce qui rend le banc inatteignable de l'extérieur. `Deno.serve(h)`
 * lierait le port 8000 ; ici on garde `h` et on rend un objet de serveur
 * inerte. Le handler est ensuite appelé DIRECTEMENT avec un `Request`, ce qui
 * est exactement « extraire le service de traitement derrière le vrai handler »
 * — sans réécrire une ligne du handler.
 */
export function captureServeHandler(): {
  handlerPromise: Promise<(req: Request) => Promise<Response>>;
  restore(): void;
} {
  const realServe = Deno.serve;
  let resolveHandler: (h: (req: Request) => Promise<Response>) => void = () => {};
  const handlerPromise = new Promise<(req: Request) => Promise<Response>>((r) => {
    resolveHandler = r;
  });
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (a: unknown, b?: unknown) => {
    const handler = (typeof a === "function" ? a : b) as (
      req: Request,
    ) => Promise<Response>;
    resolveHandler(handler);
    return {
      finished: Promise.resolve(),
      addr: { transport: "tcp", hostname: "127.0.0.1", port: 0 },
      shutdown: () => Promise.resolve(),
      ref: () => {},
      unref: () => {},
      // deno-lint-ignore no-explicit-any
    } as any;
  };
  return {
    handlerPromise,
    restore() {
      // deno-lint-ignore no-explicit-any
      (Deno as any).serve = realServe;
    },
  };
}

/** Les deux échanges archivés, lus dans les fixtures figées du lot 0. */
export function cannedFromFixtures(
  fixturesDir: string,
  requestId: string,
): { composition: CannedExchange; fill: CannedExchange } {
  const raw = JSON.parse(
    Deno.readTextFileSync(`${fixturesDir}/echanges.json`),
  ) as { evenements: Record<string, unknown>[] };
  const pick = (source: string): CannedExchange => {
    const success = raw.evenements.find((e) =>
      String(e.request_id) === requestId && String(e.source) === source &&
      String(e.status) === "success"
    );
    const start = raw.evenements.find((e) =>
      String(e.request_id) === requestId && String(e.source) === source &&
      String(e.status) === "attempt_start"
    );
    if (!success) {
      throw new Error(`fixture absente : ${source} / ${requestId}`);
    }
    return {
      source,
      model: String(success.model ?? ""),
      outputText: String(success.output_text ?? ""),
      systemPrompt: String(start?.system_prompt ?? ""),
    };
  };
  return {
    composition: pick("generate-household-meal-v1"),
    fill: pick("generate-household-meal-v1.composition_fill"),
  };
}
