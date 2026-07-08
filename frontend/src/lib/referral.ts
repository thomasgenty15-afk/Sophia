// Parrainage : helpers partagés entre la capture d'URL (?ref=CODE), le champ
// manuel du formulaire d'inscription et l'écran Parrainage.
//
// Le code est stocké côté client (localStorage) pour survivre au parcours
// pre-auth (landing → onboarding → inscription), puis transmis à la création
// du compte via les métadonnées de signUp ; l'attribution et les contrôles
// anti-abus sont faits côté base (apply_referral_attribution).

const STORAGE_KEY = "sophia:referral_code:v1";
const REFERRAL_CODE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

// Alphabet sans caractères ambigus (pas de 0/O, 1/I/L) — voir la migration
// 20260708160000_referral_program.sql.
const CODE_SUFFIX_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;
const FULL_CODE_RE = /^SOPHIA-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

/**
 * Normalise une saisie utilisateur ("sophia-k3m7", "K3M7", " k3 m7 ") vers le
 * format canonique SOPHIA-XXXX, ou null si le format est invalide.
 */
export function normalizeReferralCode(
  raw: string | null | undefined,
): string | null {
  const cleaned = String(raw ?? "").replace(/\s/g, "").toUpperCase();
  if (!cleaned) return null;
  if (FULL_CODE_RE.test(cleaned)) return cleaned;
  if (CODE_SUFFIX_RE.test(cleaned)) return `SOPHIA-${cleaned}`;
  return null;
}

type StoredReferralCode = {
  code: string;
  stored_at: string;
};

export function storeReferralCode(code: string): void {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return;
  try {
    const payload: StoredReferralCode = {
      code: normalized,
      stored_at: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // mode privé / quota : le champ manuel reste disponible à l'inscription
  }
}

export function getStoredReferralCode(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredReferralCode>;
    const code = normalizeReferralCode(parsed?.code);
    if (!code) return null;
    const storedAt = Date.parse(parsed?.stored_at ?? "");
    if (
      Number.isFinite(storedAt) &&
      Date.now() - storedAt > REFERRAL_CODE_MAX_AGE_MS
    ) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

export function clearStoredReferralCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Capture ?ref=CODE au chargement de l'app (le lien de partage pointe vers la
 * racine du site). Retourne le code normalisé si un code valide a été capturé.
 */
export function captureReferralCodeFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = normalizeReferralCode(params.get("ref"));
    if (code) storeReferralCode(code);
    return code;
  } catch {
    return null;
  }
}

export function buildReferralShareUrl(code: string): string {
  return `${window.location.origin}/?ref=${encodeURIComponent(code)}`;
}

/**
 * Message de partage pré-rempli (pensé pour WhatsApp). Ton sobre et honnête :
 * on décrit ce que l'autre personne reçoit, sans pression.
 */
export function buildReferralShareMessage(code: string): string {
  return [
    "Je pense que Sophia pourrait t'aider : c'est un coach sur WhatsApp qui m'accompagne pas à pas sur mes objectifs.",
    `Avec mon lien, tu as 30 jours d'essai gratuit (au lieu de 14) : ${buildReferralShareUrl(code)}`,
  ].join("\n");
}
