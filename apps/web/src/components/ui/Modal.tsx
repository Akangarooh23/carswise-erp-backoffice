import { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' };

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white w-full ${sizes[size]} max-h-[92vh] sm:max-h-[90vh] flex flex-col fade-in rounded-t-2xl sm:rounded-2xl shadow-xl`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          {/* drag handle on mobile */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-slate-200 rounded-full sm:hidden" />
          <h2 className="font-semibold text-slate-900 text-base">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none p-1">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
