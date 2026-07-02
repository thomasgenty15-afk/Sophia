/**
 * Pack identite user pour les visible agents.
 *
 * Toutes les reponses visibles doivent pouvoir accorder correctement
 * (genre), doser le ton (age) et personnaliser sobrement (prenom).
 * Ces champs vivent dans `profiles` mais n'etaient charges nulle part
 * dans sophia-brain: les visible agents accordaient au hasard
 * ("Je suis fatiguee" pour un homme, cf. run global15-alex-r1 T8).
 *
 * Le pack est charge une fois par tour (run.ts) et expose aux skills via
 * runtime_context.user_identity, puis aux visible agents via
 * visible_runtime_context.user_identity.
 */

export type UserIdentityPack = {
  first_name: string | null;
  age: number | null;
  gender: "male" | "female" | "other" | null;
};

function firstNameFromFullName(fullName: unknown): string | null {
  const name = String(fullName ?? "").trim();
  if (!name) return null;
  const first = name.split(/\s+/)[0]?.trim() ?? "";
  return first ? first.slice(0, 60) : null;
}

function ageFromBirthDate(birthDate: unknown, now: Date): number | null {
  const raw = String(birthDate ?? "").trim();
  if (!raw) return null;
  const birth = new Date(raw);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birth.getUTCMonth();
  if (
    monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1;
  }
  return age >= 0 && age <= 130 ? age : null;
}

function normalizeGender(value: unknown): UserIdentityPack["gender"] {
  return value === "male" || value === "female" || value === "other"
    ? value
    : null;
}

export function buildUserIdentityPack(
  profileRow: unknown,
  now: Date = new Date(),
): UserIdentityPack | null {
  if (!profileRow || typeof profileRow !== "object") return null;
  const row = profileRow as Record<string, unknown>;
  const pack: UserIdentityPack = {
    first_name: firstNameFromFullName(row.full_name),
    age: ageFromBirthDate(row.birth_date, now),
    gender: normalizeGender(row.gender),
  };
  return pack.first_name || pack.age !== null || pack.gender ? pack : null;
}

export async function loadUserIdentityPack(
  supabase: {
    from: (table: string) => any;
  },
  userId: string,
): Promise<UserIdentityPack | null> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("full_name,birth_date,gender")
      .eq("id", userId)
      .maybeSingle();
    return buildUserIdentityPack(data);
  } catch (error) {
    console.warn(
      "[UserIdentity] failed to load identity pack (non-blocking):",
      error,
    );
    return null;
  }
}

/**
 * Doctrine canonique pour tout visible agent qui recoit le pack.
 * Structurel: la regle des accords depend du champ gender fourni, jamais
 * d'une deduction depuis le texte du user.
 */
export function userIdentityVisiblePromptLines(): string[] {
  return [
    "Identite user (visible_runtime_context.user_identity, peut etre null):",
    "- Accords grammaticaux genres (fatigue/fatiguee, seul/seule) uniquement si user_identity.gender est male ou female; sinon formulation neutre sans accord genre, y compris dans les phrases a la premiere personne destinees a etre repetees par le user.",
    "- Utilise le prenom avec parcimonie, jamais a chaque message.",
    "- Adapte legerement ton et exemples a l'age sans le mentionner.",
    "- Ne recite jamais ces informations au user et ne les presente pas comme des donnees connues.",
  ];
}
