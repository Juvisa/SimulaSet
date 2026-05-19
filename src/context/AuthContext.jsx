import { createContext, useContext, useState, useEffect } from 'react';
import { getSession, clearSession, sessionToUser } from '../utils/auth';
import { getCurrentUser, saveCurrentUser } from '../utils/storage';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try new session first, fall back to legacy current_user
    const session = getSession();
    if (session) {
      setUser(sessionToUser(session));
    } else {
      const legacy = getCurrentUser();
      if (legacy) setUser(legacy);
    }
    setLoading(false);
  }, []);

  const login = (userData) => {
    setUser(userData);
    saveCurrentUser(userData);
  };

  const logout = () => {
    clearSession();
    setUser(null);
  };

  const updateUser = (userData) => {
    setUser(userData);
    saveCurrentUser(userData);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
