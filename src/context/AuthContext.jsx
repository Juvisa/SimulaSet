import { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, clearCurrentUser } from '../utils/storage';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getCurrentUser();
    if (stored) setUser(stored);
    setLoading(false);
  }, []);

  const login = (userData) => setUser(userData);

  const logout = () => {
    clearCurrentUser();
    setUser(null);
  };

  const updateUser = (userData) => setUser(userData);

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
