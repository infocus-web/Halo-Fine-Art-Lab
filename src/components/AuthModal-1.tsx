import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  X, 
  Mail, 
  Lock, 
  User, 
  ArrowRight, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  EyeOff,
  Database
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup' | 'forgot';
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signin',
  onSuccess,
}) => {
  const { signIn, signUp, resetPassword, isSupabaseLive } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      if (mode === 'signin') {
        if (!email || !password) {
          setErrorMsg('Por favor completa todos los campos.');
          setIsLoading(false);
          return;
        }
        const res = await signIn(email.trim(), password);
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setSuccessMsg('¡Sesión iniciada con éxito!');
          setTimeout(() => {
            onClose();
            if (onSuccess) onSuccess();
          }, 800);
        }
      } else if (mode === 'signup') {
        if (!email || !password || !fullName) {
          setErrorMsg('Por favor completa todos los campos requeridos.');
          setIsLoading(false);
          return;
        }
        if (password.length < 6) {
          setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
          setIsLoading(false);
          return;
        }
        const res = await signUp(email.trim(), password, fullName.trim());
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setSuccessMsg('¡Cuenta creada con éxito! Bienvenido a HALO Fine Art.');
          setTimeout(() => {
            onClose();
            if (onSuccess) onSuccess();
          }, 1200);
        }
      } else if (mode === 'forgot') {
        if (!email) {
          setErrorMsg('Por favor ingresa tu correo electrónico.');
          setIsLoading(false);
          return;
        }
        const res = await resetPassword(email.trim());
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setSuccessMsg(res.message || 'Se ha enviado un enlace de recuperación a tu correo.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocurrió un error inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md bg-[#FDFCF9] rounded-3xl border border-[#D6CEBE] shadow-2xl overflow-hidden"
      >
        {/* Top Decorative Header */}
        <div className="bg-gradient-to-r from-[#2B2621] to-[#1F1C18] p-6 text-white text-center relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-[#A89F91] hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#C5A059]/20 border border-[#C5A059]/40 mb-3 text-[#ECC880]">
            <Sparkles className="w-6 h-6" />
          </div>

          <h3 className="font-serif text-2xl tracking-wide font-normal">
            {mode === 'signin' && 'Iniciar Sesión'}
            {mode === 'signup' && 'Crear Cuenta en HALO'}
            {mode === 'forgot' && 'Recuperar Contraseña'}
          </h3>
          <p className="text-xs text-[#C7BFB1] mt-1 tracking-wider uppercase">
            {mode === 'signin' && 'Guarda tus proyectos y rastrea tus fotolibros'}
            {mode === 'signup' && 'Acceso a tu taller digital y promociones de socio'}
            {mode === 'forgot' && 'Te enviaremos las instrucciones a tu correo'}
          </p>

          {/* Supabase connection indicator */}
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 text-[10px] text-[#D6CEBE] border border-white/10">
            <span className={`w-2 h-2 rounded-full ${isSupabaseLive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <span>{isSupabaseLive ? 'Conexión Segura con Supabase Auth' : 'Almacenamiento Local Activo'}</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8">
          {/* Mode Tabs */}
          {mode !== 'forgot' && (
            <div className="flex rounded-xl bg-[#EFE9DE] p-1 mb-6 border border-[#D6CEBE]/60">
              <button
                type="button"
                onClick={() => { setMode('signin'); setErrorMsg(null); setSuccessMsg(null); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'signin'
                    ? 'bg-[#FDFCF9] text-[#1F1C18] shadow-sm'
                    : 'text-[#6B6358] hover:text-[#1F1C18]'
                }`}
              >
                Ingresar
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setErrorMsg(null); setSuccessMsg(null); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'signup'
                    ? 'bg-[#FDFCF9] text-[#1F1C18] shadow-sm'
                    : 'text-[#6B6358] hover:text-[#1F1C18]'
                }`}
              >
                Registrarme
              </button>
            </div>
          )}

          {/* Feedback messages */}
          {errorMsg && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#595248] mb-1.5">
                  Nombre Completo
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8C8275]">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ej: Carolina Rossi"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#F7F3EB] border border-[#D6CEBE] rounded-xl text-sm text-[#1F1C18] placeholder-[#9E9589] focus:outline-none focus:ring-2 focus:ring-[#C5A059] focus:bg-[#FDFCF9] transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#595248] mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8C8275]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#F7F3EB] border border-[#D6CEBE] rounded-xl text-sm text-[#1F1C18] placeholder-[#9E9589] focus:outline-none focus:ring-2 focus:ring-[#C5A059] focus:bg-[#FDFCF9] transition-all"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#595248]">
                    Contraseña
                  </label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setErrorMsg(null); setSuccessMsg(null); }}
                      className="text-xs text-[#8C6D37] hover:underline"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8C8275]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-[#F7F3EB] border border-[#D6CEBE] rounded-xl text-sm text-[#1F1C18] placeholder-[#9E9589] focus:outline-none focus:ring-2 focus:ring-[#C5A059] focus:bg-[#FDFCF9] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#8C8275] hover:text-[#1F1C18]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-[#1F1C18] text-[#FDFCF9] text-xs uppercase tracking-widest font-semibold hover:bg-[#3D352E] shadow-md transition-all flex items-center justify-center gap-2 mt-6 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>
                    {mode === 'signin' && 'Entrar a mi Cuenta'}
                    {mode === 'signup' && 'Crear mi Perfil'}
                    {mode === 'forgot' && 'Enviar Correo de Recuperación'}
                  </span>
                  <ArrowRight className="w-4 h-4 text-[#ECC880]" />
                </>
              )}
            </button>
          </form>

          {mode === 'forgot' && (
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => { setMode('signin'); setErrorMsg(null); setSuccessMsg(null); }}
                className="text-xs text-[#595248] hover:text-[#1F1C18] underline font-medium"
              >
                Volver a Iniciar Sesión
              </button>
            </div>
          )}

          {/* Privacy & Trust Badge */}
          <div className="mt-6 pt-5 border-t border-[#E8E2D5] flex items-center justify-center gap-2 text-[11px] text-[#8C8275]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#8C6D37]" />
            <span>Datos protegidos con encriptación SSL y Supabase Auth</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
