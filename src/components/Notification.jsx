import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

const NotifContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifs, setNotifs] = useState([]);

  const show = useCallback((message, type = 'success') => {
    const id = Date.now();
    setNotifs(n => [...n, { id, message, type }]);
    setTimeout(() => setNotifs(n => n.filter(x => x.id !== id)), 3500);
  }, []);

  const remove = (id) => setNotifs(n => n.filter(x => x.id !== id));

  return (
    <NotifContext.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {notifs.map(n => (
          <div key={n.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium pointer-events-auto animate-fade-in ${n.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
            {n.type === 'error' ? <XCircle size={18} /> : <CheckCircle size={18} />}
            <span>{n.message}</span>
            <button onClick={() => remove(n.id)} className="ml-2 opacity-70 hover:opacity-100"><X size={14} /></button>
          </div>
        ))}
      </div>
    </NotifContext.Provider>
  );
}

export const useNotification = () => useContext(NotifContext);
