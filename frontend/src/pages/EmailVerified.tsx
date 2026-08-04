import React from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

export default function EmailVerified() {
  const location = useLocation();
  const hasCode = new URLSearchParams(location.search).has('code');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-slate-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center animate-fade-in-up">
        <div className="mx-auto w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-emerald-200 mb-8 transform transition-transform hover:scale-105 duration-300">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <h1 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">Email confirmed!</h1>
        <p className="text-lg text-slate-600 mb-10 max-w-md mx-auto leading-relaxed">
          Thank you for taking the time to confirm your address.
          <br />
          <span className="font-medium text-slate-900">You can go back to the original tab</span> to carry on.
        </p>

        <p className="text-xs text-slate-400 mt-8 font-medium">
          {hasCode
            ? "You can close this tab."
            : "If you have just clicked the link, you can close this tab."}
        </p>
      </div>
    </div>
  );
}


