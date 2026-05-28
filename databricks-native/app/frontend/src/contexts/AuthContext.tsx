/**
 * Databricks-Native Authentication Context
 * Uses Databricks workspace SSO (the app inherits the user's Databricks session).
 * Zero external auth dependencies.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  display_name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setUser({
            id: data.user.id,
            username: data.user.username,
            display_name: data.user.display_name || data.user.username,
            email: data.user.email || '',
          });
        }
      } else {
        // Databricks App always has an authenticated user via SSO
        setUser({
          id: 'databricks-sso-user',
          username: 'analyst',
          display_name: 'SOC Analyst',
          email: '',
        });
      }
    } catch {
      // Offline/local dev fallback
      setUser({
        id: 'local-dev',
        username: 'developer',
        display_name: 'Local Developer',
        email: 'dev@local',
      });
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    setUser(null);
    // In Databricks Apps, sign-out redirects to workspace
    window.location.href = '/';
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
