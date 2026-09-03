// LE CONSENTEMENT PUBLICITAIRE — CE QUE LA PERSONNE A RÉPONDU, ET RIEN D'AUTRE.
//
// ── POURQUOI CE MODULE EXISTE AVANT LE TAG ────────────────────────────────
// En France, un cookie publicitaire ne se dépose qu'APRÈS un consentement
// explicite (CNIL, délibération 2020-091). « Continuer à naviguer vaut
// acceptation » ne vaut rien, et un bandeau dont le refus est plus difficile
// que l'acceptation ne vaut rien non plus: les deux gestes doivent coûter le
// même nombre de clics. C'est pour ça que le bandeau porte DEUX boutons de même
// poids, et aucune croix de fermeture — une croix n'est ni un oui ni un non, et
// la traiter comme un oui est exactement ce que la CNIL sanctionne.
//
// ── CE QUE CE MODULE NE FAIT PAS ──────────────────────────────────────────
// Il ne charge rien et ne mesure rien. Il ne répond qu'à « qu'a-t-elle
// répondu ? ». `googleAds.ts` décide quoi en faire. Séparés, parce que le
// consentement survit au fournisseur: le jour où le tag change, ce fichier ne
// bouge pas.

export type ConsentChoice = "granted" | "denied";

/** Ce qu'on sait du choix. `null` = la question n'a pas encore été posée. */
export type ConsentState = ConsentChoice | null;

export const CONSENT_STORAGE_KEY = "sophia.ads_consent";

/**
 * ⚠️ LE CHOIX EST DATÉ, ET C'EST UNE OBLIGATION, PAS UN CONFORT. La CNIL
 * demande de pouvoir prouver QUAND le consentement a été recueilli, et de le
 * redemander périodiquement (six mois est la durée retenue ici, dans la
 * fourchette recommandée). Un booléen nu ne permet ni l'un ni l'autre.
 */
type StoredConsent = { choice: ConsentChoice; at: string };

const SIX_MONTHS_MS = 182 * 24 * 60 * 60 * 1000;

function safeStorage(): Storage | null {
  // Même précaution que `i18n/runtime.ts`: un navigateur en navigation privée
  // peut jeter sur l'ACCÈS lui-même. Le bandeau ne doit pas faire tomber la
  // vitrine parce que quelqu'un a désactivé le stockage.
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Le choix courant, ou `null` s'il n'y en a pas — ou s'il a expiré.
 *
 * ⚠️ UN CHOIX EXPIRÉ REND `null`, PAS `"denied"`. Les deux feraient taire le
 * tag, mais ils ne disent pas la même chose au bandeau: `null` le fait
 * réapparaître pour reposer la question, `"denied"` le laisserait caché pour
 * toujours après un premier refus vieux de deux ans.
 */
export function consentState(): ConsentState {
  const raw = safeStorage()?.getItem(CONSENT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (parsed.choice !== "granted" && parsed.choice !== "denied") return null;
    const at = Date.parse(String(parsed.at ?? ""));
    if (!Number.isFinite(at) || Date.now() - at > SIX_MONTHS_MS) return null;
    return parsed.choice;
  } catch {
    // Une valeur illisible est traitée comme une absence de réponse: on
    // repose la question plutôt que de supposer un oui.
    return null;
  }
}

/** Enregistre la réponse. Le bandeau appelle ceci, et rien d'autre. */
export function recordConsent(choice: ConsentChoice): void {
  const value: StoredConsent = { choice, at: new Date().toISOString() };
  try {
    safeStorage()?.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Stockage refusé: le choix ne survivra pas au rechargement, et la question
    // sera reposée. C'est le bon échec — l'autre serait de mesurer quand même.
  }
}
