// src/context/ToastContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ToastType, Toast } from '../components/Toast';

interface ToastContextType {
  showToast: (toast: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastType[]>([]);

  const showToast = (toast: ToastType) => {
    setToasts((prev) => {
      const next = [...prev, toast];
      return next.length > 5 ? next.slice(1) : next;
    });

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, toast.duration || 3000);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
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
