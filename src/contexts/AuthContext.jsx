import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('stocktracker_session');
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch {}
    }
    setLoading(false);
  }, []);

  const register = (name, email, password) => {
    const users = JSON.parse(localStorage.getItem('stocktracker_users') || '[]');
    if (users.find(u => u.email === email)) {
      throw new Error('Email already registered');
    }
    const newUser = { id: Date.now().toString(), name, email, password, createdAt: new Date().toISOString() };
    users.push(newUser);
    localStorage.setItem('stocktracker_users', JSON.stringify(users));
    const session = { id: newUser.id, name: newUser.name, email: newUser.email };
    setUser(session);
    localStorage.setItem('stocktracker_session', JSON.stringify(session));
    return session;
  };

  const login = (email, password) => {
    const users = JSON.parse(localStorage.getItem('stocktracker_users') || '[]');
    const found = users.find(u => u.email === email && u.password === password);
    if (!found) throw new Error('Invalid email or password');
    const session = { id: found.id, name: found.name, email: found.email };
    setUser(session);
    localStorage.setItem('stocktracker_session', JSON.stringify(session));
    return session;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('stocktracker_session');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
