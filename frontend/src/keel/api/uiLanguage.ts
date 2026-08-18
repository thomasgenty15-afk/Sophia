// KEEL — CHANGER DE LANGUE, EN UN SEUL GESTE QUI ÉCRIT LES DEUX MÉMOIRES.
//
// ── LE DÉFAUT QUE CE MODULE FERME ──────────────────────────────────────────
// Il y a deux endroits où « ma langue » est écrite, et ils servent deux
// consommateurs différents:
//
//   `localStorage`     -> ce que `t()` rend, sur CE navigateur
//   `profiles.locale`  -> ce que l'AGENT parle, partout, sur tous les appareils
//
// Un sélecteur qui n'écrirait que le premier produirait le pire des états: une
// interface française et un coach qui répond en anglais, sur le même écran.
// C'est exactement ce qui serait arrivé sur `/app/setup`, où le drapeau est
// rendu à un utilisateur DÉJÀ CONNECTÉ.
//
// D'où un seul point d'entrée, appelé par le drapeau ET par la ligne de
// réglages de `/account`. Deux contrôles, un comportement.

import { supabase } from "../../lib/supabase";
import { composeProfileLocale, type UiLocale } from "../i18n/catalog";
import { ANONYMOUS_LOCALE_OWNER, setUiLocaleAndReload } from "../i18n/runtime";

/**
 * Écrit la langue choisie sur le compte, si compte il y a, puis recharge.
 *
 * ── POURQUOI L'ÉCHEC EN BASE NE BLOQUE PAS LA BASCULE ─────────────────────
 * Refuser de changer l'interface parce qu'un `update` a échoué punirait la
 * personne pour un problème de réseau, sur un geste qu'elle peut refaire.
 * `setUiLocaleAndReload` pose le garde au nom du compte qui a cliqué, donc la
 * divergence dure au plus cet onglet ET ne concerne que lui: à la session
 * suivante, la langue du compte reprend la main, et un AUTRE compte ouvert
 * entre-temps n'a jamais été gelé par ce clic-là.
 * L'échec est journalisé — visible pour NOUS, jamais pour elle.
 *
 * ── POURQUOI `composeProfileLocale` ET PAS `fr-FR` EN DUR ─────────────────
 * Elle ne change QUE le sous-tag de langue. Un coach britannique qui passe en
 * français devient `fr-GB`, pas `fr-FR` — côté serveur, `crisis_resources.ts`
 * déduit le pays de la région quand `profiles.country` est NULL, et inventer
 * une région ici changerait le numéro d'urgence servi à ses élèves.
 */
export async function chooseUiLanguage(next: UiLocale): Promise<void> {
  // AU NOM DE QUI CE CLIC EST FAIT. Hors session, `"anon"` — et c'est tout le
  // correctif du 2026-08-14: un clic anonyme ne peut plus geler l'écran des
  // comptes qu'on ouvrira ensuite dans le même onglet. Il ne les concerne pas.
  let owner = ANONYMOUS_LOCALE_OWNER;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id ?? null;
    if (userId) {
      owner = userId;
      // On relit la locale courante pour ne pas perdre la RÉGION. Un `select`
      // d'une colonne sur une ligne qu'on possède: le coût est celui du
      // round-trip, payé une fois par changement de langue dans une vie.
      const { data: row } = await supabase
        .from("profiles")
        .select("locale")
        .eq("id", userId)
        .single();
      const currentProfileLocale = (row as { locale?: string | null } | null)
        ?.locale ?? null;
      const { error } = await supabase
        .from("profiles")
        .update({ locale: composeProfileLocale(next, currentProfileLocale) })
        .eq("id", userId);
      if (error) console.warn("[uiLanguage] profile locale not saved", error);
    }
  } catch (err) {
    console.warn("[uiLanguage] profile locale not saved", err);
  }
  setUiLocaleAndReload(next, owner);
}
