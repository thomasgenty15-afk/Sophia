import React from 'react';
import { useNavigate } from 'react-router-dom';

const Footer = () => {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-slate-100 py-12">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <img src="/apple-touch-icon.png" alt="Sophia Logo" className="w-8 h-8 rounded-lg" />
            <span className="font-bold text-slate-900">Sophia Coach</span>
          </div>
          <span className="text-xs text-slate-400 font-medium">Powered by IKIZEN</span>
        </div>
        
        <div className="flex gap-6 text-sm text-slate-500">
          <button onClick={() => navigate('/legal#mentions-legales')} className="hover:text-violet-600 transition-colors">
            Mentions légales
          </button>
          <button onClick={() => navigate('/legal#confidentialite')} className="hover:text-violet-600 transition-colors">
            Politique de confidentialité
          </button>
        </div>

        <div className="text-sm text-slate-500">
          © {currentYear} IKIZEN. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;

