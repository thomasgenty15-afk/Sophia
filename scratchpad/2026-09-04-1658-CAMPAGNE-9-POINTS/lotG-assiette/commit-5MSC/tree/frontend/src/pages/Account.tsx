import { useNavigate, useSearchParams } from "react-router-dom";

import UserProfile from "../components/UserProfile";

/**
 * Page dédiée /account : même modale profil que sur l’ancien dashboard
 * (général, abonnement, réglages). Utile pour les liens directs et les favoris.
 */
export default function Account() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const tabParam = params.get("tab");
  const initialTab =
    tabParam === "subscription"
      ? "subscription"
      : tabParam === "settings"
        ? "settings"
        : "general";

  const mode =
    params.get("mode") === "architecte" ? "architecte" : "action";

  return (
    // `bg-paper` (#FBF8FA) et non `bg-gray-50`: le fond de page de la charte.
    // Ce qu'on voit ici, c'est la bande à GAUCHE du panneau sous le voile —
    // donc le seul rôle de ce fond est de ne pas être un gris froid à côté
    // d'une surface qui porte la température de la marque.
    <div className="min-h-screen bg-paper">
      <UserProfile
        isOpen
        // `/` et non `/dashboard`, supprimée avec le produit grand public: la
        // landing renvoie un visiteur déjà connecté vers SON espace via
        // `resolveHomePath`, donc fermer le compte ramène chacun chez lui —
        // coach, élève, ou personne des deux.
        onClose={() => navigate("/")}
        mode={mode}
        initialTab={initialTab}
      />
    </div>
  );
}
