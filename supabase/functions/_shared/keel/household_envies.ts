/**
 * LE CONSEIL DE FAMILLE — mettre les envies en commun. PUR.
 *
 * Autorité produit: docs/keel/PIVOT-FOYER.md §8.
 *
 * Le week-end, chacun dit ce dont il a envie. Le produit met en commun et
 * compose. C'est le rituel autour duquel tout s'organise, et ce module est la
 * moitié qui prépare le prompt.
 *
 * ── LA RÈGLE DE SURVIE: LE SILENCE EST UNE RÉPONSE VALIDE (§8.4) ─────────
 * C'est la contrainte la plus importante du fichier, et elle a une raison
 * mesurable: si le plan attend que quatre personnes répondent, celui qui tient
 * le foyer doit courir après tout le monde — et on a **recréé la charge
 * mentale qu'on promettait de supprimer**. Le produit se retourne alors contre
 * sa propre promesse.
 *
 * Donc: absence de ligne = état légitime, jamais un « en attente ». Le plan
 * sort quand même, la personne est composée depuis son profil, et le bloc le
 * DIT — parce qu'on doit pouvoir lui répondre « voilà ce qui a été choisi pour
 * toi » plutôt que de faire comme si elle avait parlé.
 *
 * ── DEUX ENVIES CONTRADICTOIRES NE SE RÉSOLVENT PAS ICI ──────────────────
 * « Je veux du poisson » et « je déteste le poisson » partent tous les deux
 * dans le prompt, tels quels. L'arbitrage appartient au générateur, avec
 * l'obligation de DIRE ce qu'il a arbitré. Trancher ici, en code, produirait
 * un arbitrage muet — et un foyer à qui l'on retire son envie sans un mot
 * cesse de déposer des envies.
 *
 * ── ET IL NE REND JAMAIS « IMPOSSIBLE » ──────────────────────────────────
 * Aucun chemin de ce module ne lève. Un générateur qui renvoie une erreur à
 * une famille le samedi soir est un produit mort (§8.4).
 */

/** Ce qu'on sait d'un membre pour composer le bloc. Rien de nutritionnel. */
export interface EnvyMember {
  memberId: string;
  displayName: string;
}

export interface EnvySubmission {
  memberId: string;
  body: string;
}

export interface MergedEnvies {
  /** Le bloc à injecter. Vide quand il n'y a rien à dire. */
  promptBlock: string;
  /** Ceux qui ont parlé, dans l'ordre du foyer. */
  spoken: string[];
  /** Ceux qui n'ont rien dit. Rendu à l'écran, pas seulement au modèle. */
  silent: string[];
}

/**
 * PLAFOND PAR ENVIE. La base en pose déjà un (`household_envy_body_check`,
 * 500 caractères), et celui-ci n'est pas un doublon: ce module peut être appelé
 * avec du texte qui n'est pas passé par la RPC (un import, un test, un chemin
 * futur). Un prompt de 20 Ko est un défaut que ce dépôt a déjà payé sur le
 * composeur; la borne vit donc aussi du côté qui construit le prompt.
 */
export const MAX_ENVY_CHARS = 500;

/**
 * PLAFOND DE MEMBRES RENDUS. Un foyer réel en compte deux à six. Au-delà, on
 * tronque et on le DIT dans le bloc — jamais en silence: une troncature muette
 * se lit « tout le monde a été pris en compte » alors que c'est faux.
 */
export const MAX_ENVY_MEMBERS = 12;

function clamp(body: string): string {
  const text = body.trim().replace(/\s+/g, " ");
  return text.length <= MAX_ENVY_CHARS ? text : `${text.slice(0, MAX_ENVY_CHARS)}…`;
}

/**
 * @param members l'ordre du foyer. Il gouverne l'ordre de sortie: un bloc dont
 *        l'ordre changerait d'une semaine à l'autre rendrait les diffs de
 *        prompt illisibles et casserait le cache d'invite.
 */
export function mergeEnvies(
  members: readonly EnvyMember[],
  submissions: readonly EnvySubmission[],
): MergedEnvies {
  const byMember = new Map<string, string>();
  for (const s of submissions) {
    const body = typeof s?.body === "string" ? clamp(s.body) : "";
    // Une soumission d'un non-membre est ignorée SANS BRUIT: elle ne peut
    // venir que d'un membre parti, et le foyer n'a pas à voir son nom
    // ressurgir dans le plan de la semaine.
    if (body && members.some((m) => m.memberId === s.memberId)) {
      byMember.set(s.memberId, body);
    }
  }

  const rendered = members.slice(0, MAX_ENVY_MEMBERS);
  const dropped = members.length - rendered.length;

  const spoken: string[] = [];
  const silent: string[] = [];
  const lines: string[] = [];

  for (const m of rendered) {
    const body = byMember.get(m.memberId);
    if (body) {
      spoken.push(m.memberId);
      lines.push(`- ${m.displayName} asked for: ${body}`);
    } else {
      silent.push(m.memberId);
      lines.push(`- ${m.displayName} did not say anything this week.`);
    }
  }

  if (rendered.length === 0) return { promptBlock: "", spoken, silent };

  const block = [
    "WHAT THE HOUSEHOLD ASKED FOR THIS WEEK.",
    "",
    ...lines,
    ...(dropped > 0 ? [`- (${dropped} more people in this household are not listed here.)`] : []),
    "",
    // Le silence: une consigne, pas une excuse. Sans elle, un modèle attend
    // ou invente une envie pour celui qui n'a rien dit.
    "Anyone who did not say anything is composed from their profile alone.",
    "That is a normal outcome, not a missing input: never wait for them, never",
    "invent a request on their behalf.",
    "",
    // L'arbitrage: obligatoire, et DIT.
    "These requests may contradict each other. Compose ONE plan anyway and say",
    "plainly, in one short sentence, what you traded off and for whom.",
    "Never answer that the week is impossible.",
  ].join("\n");

  return { promptBlock: block, spoken, silent };
}
