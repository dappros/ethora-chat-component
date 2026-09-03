// src/context/ToastContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { ToastType, Toast } from '../components/Toast';

interface ToastContextType {
  showToast: (toast: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastType[]>([]);

  // Stable callback + memoized context value: this provider wraps the whole
  // chat tree, so a fresh value object per render (and per toast appearing/
  // disappearing) forced every context consumer below to re-render.
  const showToast = useCallback((toast: ToastType) => {
    setToasts((prev) => {
      const next = [...prev, toast];
      return next.length > 5 ? next.slice(1) : next;
    });

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, toast.duration || 3000);
  }, []);

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          left: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          zIndex: 9999,
        }}
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
