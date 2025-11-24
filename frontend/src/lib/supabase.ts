// MOCK INTELLIGENT AVEC LOCALSTORAGE
// Permet de simuler une session persistante entre les pages

const getMockSession = () => {
  const stored = localStorage.getItem('mock_supabase_session');
  return stored ? JSON.parse(stored) : null;
};

const setMockSession = (user: any) => {
  const session = { user, access_token: 'mock-token' };
  localStorage.setItem('mock_supabase_session', JSON.stringify(session));
  // On notifie les abonnés (très simplifié via un event custom pour que AuthContext réagisse)
  window.dispatchEvent(new Event('mock-auth-change'));
  return session;
};

const clearMockSession = () => {
  localStorage.removeItem('mock_supabase_session');
  window.dispatchEvent(new Event('mock-auth-change'));
};

export const supabase = {
  auth: {
    getSession: async () => {
      const session = getMockSession();
      return { data: { session }, error: null };
    },
    onAuthStateChange: (callback: any) => {
      // On écoute l'event custom pour simuler le temps réel
      const handler = () => {
        const session = getMockSession();
        callback('SIGNED_IN', session);
      };
      window.addEventListener('mock-auth-change', handler);
      
      // Appel initial
      const session = getMockSession();
      callback(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);

      return { data: { subscription: { unsubscribe: () => window.removeEventListener('mock-auth-change', handler) } } };
    },
    resetPasswordForEmail: async (email: string, options: any) => {
      // Simulation d'envoi d'email
      console.log(`[MOCK] Reset password email sent to ${email} with options:`, options);
      return { data: {}, error: null };
    },
    signUp: async ({ email, options }: any) => {
      const user = { 
        id: 'mock-user-id', 
        email, 
        user_metadata: options?.data || {} 
      };
      const session = setMockSession(user);
      return { data: { user, session }, error: null };
    },
    signInWithPassword: async ({ email }: any) => {
      // On simule une connexion réussie avec n'importe quel mot de passe
      const user = { 
        id: 'mock-user-id', 
        email, 
        user_metadata: { full_name: 'Utilisateur Test' } 
      };
      const session = setMockSession(user);
      return { data: { user, session }, error: null };
    },
    signOut: async () => {
      clearMockSession();
      return { error: null };
    },
  }
};