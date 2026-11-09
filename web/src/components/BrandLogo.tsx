import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Zap } from 'lucide-react';
export const BrandLogo: React.FC<{ className?: string }> = ({ className = 'h-6' }) => {
  const { theme } = useAuth();
  const [fail, setFail] = useState(false);
  const src = theme === 'dark' ? '/new/logo-dark.png' : '/new/logo-light.png';
  useEffect(() => { setFail(false); }, [src]);
  if (fail) return <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white shrink-0"><Zap className="w-3 h-3 fill-current" /></div>;
  return <img key={src} src={src} alt="ZAMIL" onError={() => setFail(true)} className={`${className} w-auto object-contain shrink-0`} />;
};
export default BrandLogo;
