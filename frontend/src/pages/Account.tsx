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
    <div className="min-h-screen bg-gray-50">
      <UserProfile
        isOpen
        onClose={() => navigate("/dashboard")}
        mode={mode}
        initialTab={initialTab}
      />
    </div>
  );
}
