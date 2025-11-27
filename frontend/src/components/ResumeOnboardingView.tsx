import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle } from 'lucide-react';

const ResumeOnboardingView = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-bold text-slate-900 mb-4">Votre profil est incomplet</h1>
      <p className="text-slate-500 mb-8">Veuillez terminer le questionnaire pour accéder au tableau de bord.</p>
      <button
        onClick={() => navigate('/onboarding')}
        className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors"
      >
        <PlayCircle className="w-5 h-5" />
        Reprendre le questionnaire
      </button>
    </div>
  );
};

export default ResumeOnboardingView;
