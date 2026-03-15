import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ToastContext = createContext(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx.toast;
};

let toastId = 0;

const typeStyles = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  info: 'bg-blue-600',
};

const typeIcons = {
  success: (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
    </svg>
  ),
};

function Toast({ id, message, type, onRemove }) {
  const [state, setState] = useState('entering'); // entering | visible | exiting
  const timerRef = useRef(null);

  useEffect(() => {
    // Trigger enter animation on next frame
    const enterFrame = requestAnimationFrame(() => setState('visible'));

    // Auto-dismiss after 3 seconds
    timerRef.current = setTimeout(() => {
      setState('exiting');
      setTimeout(() => onRemove(id), 300);
    }, 3000);

    return () => {
      cancelAnimationFrame(enterFrame);
      clearTimeout(timerRef.current);
    };
  }, [id, onRemove]);

  const dismiss = () => {
    clearTimeout(timerRef.current);
    setState('exiting');
    setTimeout(() => onRemove(id), 300);
  };

  const animClass =
    state === 'entering'
      ? 'translate-x-full opacity-0'
      : state === 'exiting'
        ? 'translate-x-full opacity-0'
        : 'translate-x-0 opacity-100';

  return (
    <div
      role="alert"
      onClick={dismiss}
      className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white cursor-pointer
        transition-all duration-300 ease-in-out ${typeStyles[type] || typeStyles.info} ${animClass}`}
    >
      {typeIcons[type] || typeIcons.info}
      <span>{message}</span>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message, type = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container - fixed top-right, stacked vertically */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <Toast id={t.id} message={t.message} type={t.type} onRemove={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastContext;
