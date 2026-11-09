import React from "react";
export default function ConfirmModal({ open, title, body, confirmText = "Confirm", danger = true, onConfirm, onClose }:
{ open: boolean; title: string; body: React.ReactNode; confirmText?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }){
  if (!open) return null;
  return <div className="fixed inset-0 z-[900] flex items-center justify-center p-5" onClick={onClose}>
    <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
    <div className="card a-zoom relative w-full max-w-[340px] p-6 text-center" onClick={e => e.stopPropagation()}>
      <div className="text-3xl mb-2">{danger ? "⚠️" : "❓"}</div>
      <h3 className="font-display font-bold text-lg mb-2">{title}</h3>
      <div className="text-sm text-[var(--muted)] leading-relaxed mb-5">{body}</div>
      <div className="flex gap-3">
        <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
        <button className={"btn flex-1 " + (danger ? "btn-danger" : "btn-primary")} onClick={() => { onClose(); onConfirm(); }}>{confirmText}</button>
      </div>
    </div>
  </div>;
}