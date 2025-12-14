import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  Mail, 
  Lock, 
  ArrowRight, 
  Sparkles, 
  ShieldCheck, 
  User,
  Phone,
  AlertCircle,
  Loader2
} from 'lucide-react';

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Récupérer les données du plan si on vient du flux onboarding
  const planData = location.state || null;
  const isRegistrationFlow = !!planData?.finalOrder; // Si on a des priorités, c'est une inscription

  const [isSignUp, setIsSignUp] = useState(isRegistrationFlow); // Par défaut Inscription si flux, sinon Connexion
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmationPending, setConfirmationPending] = useState(false); // Nouvel état
  const [isResettingPassword, setIsResettingPassword] = useState(false); // Pour la demande de reset MDP

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Note: Le mock doit supporter resetPasswordForEmail si on veut tester la simulation
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/auth?view=update_password',
      });

      if (error) throw error;

      alert("Email de réinitialisation envoyé !");
      setIsResettingPassword(false);
    } catch (err: any) {
      console.error("Reset error:", err);
      setError(err.message || "Erreur lors de l'envoi.");
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        // --- INSCRIPTION ---
        // Basic phone validation (optional but recommended)
        if (!phone) {
             throw new Error("Le numéro de téléphone est requis pour Sophia.");
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { 
                full_name: name,
                phone: phone // Stocker le téléphone dans les métadonnées
            } 
          }
        });

        if (error) throw error;

        // GESTION DE LA CONFIRMATION EMAIL
        // Si l'inscription est un succès mais qu'il n'y a pas de session active (user créé mais non vérifié)
        // OU si on veut forcer l'affichage pour l'UX si la config est active.
        // Note : Avec le mock actuel, data.session est toujours présent.
        // En prod, si "Confirm Email" est ON, data.session sera null.
        if (data.user && !data.session) {
          setConfirmationPending(true);
          setLoading(false);
          return;
        }
        
        if (data.user) {
            // --- BACKFILL DES RÉPONSES POUR LE NOUVEAU COMPTE ---
            if (isRegistrationFlow && planData?.fullAnswers) {
                try {
                    console.log("💾 Sauvegarde des réponses Invité pour le nouveau compte...");
                    
                    // On vérifie si on a le payload complet (nouveau format) ou partiel
                    const answersPayload = planData.fullAnswers;
                    const submissionId = planData.submissionId || crypto.randomUUID();
                    
                    // On adapte le contenu pour qu'il soit compatible (structured_data vs ui_state)
                    // Si fullAnswers contient déjà la structure, on l'utilise, sinon on l'enrobe
                    const contentToSave = answersPayload.ui_state ? answersPayload : {
                        structured_data: answersPayload,
                        ui_state: {},
                        last_updated: new Date().toISOString()
                    };

                    const { error: answersError } = await supabase.from('user_answers').insert({
                        user_id: data.user.id,
                        questionnaire_type: 'onboarding',
                        submission_id: submissionId,
                        content: contentToSave,
                        status: 'completed', // On considère le questionnaire fini puisqu'on est là
                        sorting_attempts: 1
                    });

                    if (answersError) {
                        console.error("Erreur sauvegarde réponses post-inscription:", answersError);
                        // On ne bloque pas le flux, le fallback state prendra le relais, mais c'est noté
                    } else {
                        console.log("✅ Réponses sauvegardées avec succès pour", data.user.id);
                    }
                } catch (backfillErr) {
                    console.error("Erreur backfill:", backfillErr);
                }
            }

            if (isRegistrationFlow) {
                // Flow Standard : Génération après questionnaire
                navigate('/plan-generator', { state: planData });
            } else if (isSignUp) {
                // Inscription Directe (via Landing) -> Onboarding
                navigate('/global-plan');
            } else {
                // Connexion (via Landing) -> Dashboard
                navigate('/dashboard');
            }
        }

      } else {
        // --- CONNEXION ---
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        if (data.user) {
            navigate('/dashboard');
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  // VUE "VÉRIFIEZ VOS EMAILS"
  if (confirmationPending) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-slate-900">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center animate-fade-in-up">
          <div className="mx-auto w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg mb-6">
            <Mail className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            Vérifiez votre boîte mail.
          </h2>
          <p className="text-slate-600 mb-8 max-w-sm mx-auto">
            Un lien de confirmation a été envoyé à <strong>{email}</strong>. Cliquez dessus pour activer votre compte et accéder à votre plan.
          </p>
          <button 
            onClick={() => window.location.reload()} // Simule un "J'ai vérifié"
            className="text-sm font-bold text-slate-900 hover:text-indigo-600 underline decoration-dotted"
          >
            J'ai cliqué sur le lien
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-slate-900">
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* LOGO */}
        <div className="mx-auto w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white text-2xl font-serif font-bold shadow-lg mb-6">
          S.
        </div>

        {isRegistrationFlow ? (
          <div className="animate-fade-in-up">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              Dernière étape avant votre plan {planData.finalOrder[0].theme}.
            </h2>
            <p className="text-slate-600 max-w-sm mx-auto">
              Créez votre espace sécurisé pour finaliser votre stratégie.
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {isResettingPassword 
                ? "Réinitialisation" 
                : isSignUp 
                  ? "Bienvenue sur Sophia." 
                  : "Ravi de vous revoir."}
            </h2>
            <p className="text-slate-600">
              {isResettingPassword 
                ? "Nous allons vous envoyer un lien magique."
                : isSignUp 
                  ? "Créez votre compte pour commencer." 
                  : "Connectez-vous pour reprendre votre transformation."}
            </p>
          </div>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md animate-fade-in-up delay-100">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200 rounded-2xl sm:px-10 border border-slate-100">
          
          {isResettingPassword ? (
            /* --- FORMULAIRE MOT DE PASSE OUBLIÉ --- */
            <form className="space-y-6" onSubmit={handleResetPassword}>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  Adresse Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                    placeholder="vous@exemple.com"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
                  <p className="text-sm text-red-700 font-medium">{error}</p>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-slate-900 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> Envoi...
                    </>
                  ) : (
                    "Envoyer le lien"
                  )}
                </button>
              </div>

              <div className="text-center">
                <button 
                  type="button"
                  onClick={() => setIsResettingPassword(false)}
                  className="text-sm font-medium text-slate-500 hover:text-indigo-600"
                >
                  Retour à la connexion
                </button>
              </div>
            </form>
          ) : (
            /* --- FORMULAIRE AUTHENTIFICATION (LOGIN / SIGNUP) --- */
            <form className="space-y-6" onSubmit={handleAuth}>
            
            {/* Champ NOM (Seulement si Inscription) */}
            {isSignUp && (
              <>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    Prénom
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      required={isSignUp}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                      placeholder="Votre prénom"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    Adresse Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                      placeholder="vous@exemple.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    Numéro WhatsApp
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="tel"
                      required={isSignUp}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                      placeholder="+33 6 12 34 56 78"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Pour que Sophia puisse vous contacter.</p>
                </div>
              </>
            )}

            {/* Pour le Login, on affiche juste l'email (sans les champs d'inscription) */}
            {!isSignUp && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">
                Adresse Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                  placeholder="vous@exemple.com"
                />
              </div>
            </div>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">
                Mot de passe
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
            </div>

            {!isSignUp && (
              <div className="flex items-center justify-end">
                <div className="text-sm">
                  <button 
                    type="button"
                    onClick={() => setIsResettingPassword(true)}
                    className="font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-slate-900 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Traitement...
                  </>
                ) : isSignUp ? (
                  <>
                    Découvrir mon Plan <ArrowRight className="w-5 h-5" />
                  </>
                ) : (
                  "Se connecter"
                )}
              </button>
            </div>
            </form>
          )}

          {/* SWITCHER LOGIN/SIGNUP (Masqué si Reset Password) */}
          {!isResettingPassword && (
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500">
                    {isSignUp ? "Déjà un compte ?" : "Pas encore de compte ?"}
                  </span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3">
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="w-full inline-flex justify-center py-3 px-4 border border-slate-200 rounded-xl shadow-sm bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {isSignUp ? "Me connecter" : "Créer un compte gratuitement"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Trust Signals */}
        {isSignUp && !isResettingPassword && (
            <div className="mt-8 flex justify-center gap-6 text-xs text-slate-400 font-medium uppercase tracking-wider">
                <span className="flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> Données Privées</span>
                <span className="flex items-center gap-1"><Sparkles className="w-4 h-4" /> IA Sécurisée</span>
            </div>
        )}
      </div>
    </div>
  );
};

export default Auth;
