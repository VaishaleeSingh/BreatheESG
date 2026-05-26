import React, { useState, useEffect } from 'react';
import { authApi } from './api';
import type { CurrentUser } from './types';
import Dashboard from './pages/Dashboard';
import UploadPage from './pages/UploadPage';
import ReviewPage from './pages/ReviewPage';
import toast from 'react-hot-toast';

type Page = 'dashboard' | 'upload' | 'review';

// ─── Leaf SVG Logo ───────────────────────────────────────────────────────────
function LeafIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-8 2C14 3 6 3 6 3 8.09 8.17 13 8 17 8z" />
    </svg>
  );
}

// ─── Auth Screen ─────────────────────────────────────────────────────────────
interface AuthProps {
  onLogin: (user: CurrentUser) => void;
}

function AuthScreen({ onLogin }: AuthProps) {
  const [isLoginMode, setIsLoginMode] = useState(true);
  
  // Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLoginMode) {
        const user = await authApi.login(username, password);
        onLogin(user);
        toast.success(`Welcome back, ${user.first_name || user.username}!`);
      } else {
        // Signup
        await authApi.signup({
          username,
          email,
          company_name: companyName,
          password,
        });
        // Auto-login after successful signup
        const user = await authApi.login(username, password);
        onLogin(user);
        toast.success(`Account created! Welcome, ${user.username}!`);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (isLoginMode) {
        if (status === 401 || status === 403) {
          setError('Invalid username or password.');
        } else {
          setError('Unable to connect to server. Please try again.');
        }
      } else {
        if (err?.response?.data) {
          // Display the first validation error
          const msg = Object.values(err.response.data)[0];
          setError(Array.isArray(msg) ? msg[0] : String(msg));
        } else {
          setError('Registration failed. Please try again.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-teal-500 rounded-xl flex items-center justify-center shadow-md">
              <LeafIcon className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-slate-900 tracking-tight">
              Breathe <span className="text-teal-500">ESG</span>
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">Data Review Platform</p>
        </div>

        {/* Card */}
        <div className="card">
          <h2 className="text-xl font-semibold text-slate-900 mb-1">
            {isLoginMode ? 'Sign in' : 'Create an account'}
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            {isLoginMode
              ? 'Enter your credentials to access the platform'
              : 'Register to set up a new company workspace'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Username
              </label>
              <input
                type="text"
                className="input"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            
            {!isLoginMode && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    className="input"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Company Name
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Acme Corp"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="input pr-10"
                  placeholder={isLoginMode ? "Enter your password" : "At least 8 characters"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isLoginMode ? "current-password" : "new-password"}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full justify-center py-2.5"
              disabled={loading}
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {isLoginMode ? 'Signing in…' : 'Creating account…'}
                </>
              ) : (
                isLoginMode ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLoginMode(!isLoginMode);
                setError('');
              }}
              className="text-sm text-teal-600 hover:text-teal-800 font-medium"
            >
              {isLoginMode
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          © {new Date().getFullYear()} Breathe ESG. All rights reserved.
        </p>
      </div>
    </div>
  );
}

// ─── Nav Link ─────────────────────────────────────────────────────────────────
interface NavLinkProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function NavLink({ active, onClick, children }: NavLinkProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-teal-500 text-white shadow-sm'
          : 'text-slate-600 hover:bg-cream-200 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Top Nav ──────────────────────────────────────────────────────────────────
interface NavBarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  user: CurrentUser;
  onLogout: () => void;
}

function NavBar({ currentPage, onNavigate, user, onLogout }: NavBarProps) {
  const initials =
    (user.first_name?.[0] ?? '') + (user.last_name?.[0] ?? '') ||
    user.username[0].toUpperCase();

  return (
    <header className="bg-white border-b border-cream-200 shadow-sm sticky top-0 z-40">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center">
            <LeafIcon className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900 tracking-tight hidden sm:inline">
            Breathe <span className="text-teal-500">ESG</span>
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar">
          <NavLink
            active={currentPage === 'dashboard'}
            onClick={() => onNavigate('dashboard')}
          >
            Dashboard
          </NavLink>
          <NavLink
            active={currentPage === 'upload'}
            onClick={() => onNavigate('upload')}
          >
            Upload Data
          </NavLink>
          <NavLink
            active={currentPage === 'review'}
            onClick={() => onNavigate('review')}
          >
            Review Records
          </NavLink>
        </nav>

        {/* User */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-slate-900 leading-tight">
              {user.first_name
                ? `${user.first_name} ${user.last_name}`
                : user.username}
            </p>
            {user.tenant && (
              <p className="text-xs text-slate-500 leading-tight">{user.tenant.name}</p>
            )}
          </div>
          <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-sm font-semibold">
            {initials}
          </div>
          <button
            onClick={onLogout}
            title="Sign out"
            className="p-2 rounded-lg text-slate-400 hover:bg-cream-200 hover:text-slate-700 transition-all duration-150"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState<Page>('dashboard');

  // Restore session on load
  useEffect(() => {
    const creds = sessionStorage.getItem('breathe_auth');
    if (creds) {
      authApi
        .me()
        .then(setUser)
        .catch(() => sessionStorage.removeItem('breathe_auth'))
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  const handleLogin = (u: CurrentUser) => setUser(u);

  const handleLogout = () => {
    authApi.logout();
    setUser(null);
    setPage('dashboard');
    toast.success('Signed out successfully.');
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 bg-teal-500 rounded-xl flex items-center justify-center animate-pulse">
            <LeafIcon className="w-6 h-6 text-white" />
          </div>
          <p className="text-sm text-slate-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <NavBar
        currentPage={page}
        onNavigate={setPage}
        user={user}
        onLogout={handleLogout}
      />
      <main className="max-w-screen-xl mx-auto px-6 py-8">
        {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
        {page === 'upload' && <UploadPage />}
        {page === 'review' && <ReviewPage />}
      </main>
    </div>
  );
}
