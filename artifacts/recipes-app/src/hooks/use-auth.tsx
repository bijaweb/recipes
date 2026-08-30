import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { signInWithGoogle, getCurrentUser, type User } from '@workspace/api-client-react';

const TOKEN_STORAGE_KEY = 'night-roulette-token';

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

// Registered once at module load so every API call made through the
// generated hooks automatically carries the current token, if any.
setAuthTokenGetter(getStoredToken);

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  error: string;
  signIn: (credential: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    getCurrentUser()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const signIn = useCallback(async (credential: string) => {
    setError('');
    try {
      const { token, user } = await signInWithGoogle({ credential });
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      setUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    }
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
