import React from 'react';
import type { ReviewResult } from '../engine/review';

const STYLES = {
  pass: { label: 'Checks passed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  flag: { label: 'Check the notes', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  reject: { label: 'Failed checks', className: 'bg-red-50 text-red-700 border-red-200' },
};

// The check-list verdict for one generated image, with the failed checks spelled out.
export const ReviewBadge: React.FC<{ review?: ReviewResult }> = ({ review }) => {
  if (!review) return <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Not reviewed</span>;
  const style = STYLES[review.verdict];
  const failed = review.checks.filter(c => !c.pass);
  return (
    <div className={`text-left text-xs rounded-xl border px-3 py-2 max-w-[60%] ${style.className}`}>
      <span className="font-black uppercase tracking-widest text-[10px]">{style.label}</span>
      {failed.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {failed.map(c => (
            <li key={c.id}><span className="font-bold">{c.label}:</span> {c.reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
