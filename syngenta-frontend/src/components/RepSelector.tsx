'use client';

import { useEffect, useState } from 'react';
import { getReps, Rep } from '@/lib/api';
import { ChevronDown } from 'lucide-react';

interface Props {
  currentRepId: string;
  onSelect: (repId: string, territoryId: string) => void;
}

export default function RepSelector({ currentRepId, onSelect }: Props) {
  const [reps, setReps] = useState<Rep[]>([]);
  const [open, setOpen] = useState(false);
  const current = reps.find(r => r.rep_id === currentRepId);

  useEffect(() => {
    getReps().then(d => setReps((d.reps ?? []).slice(0, 20))).catch(() => {});
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm shadow-sm hover:border-green-400 transition-colors"
      >
        <div className="text-left">
          <div className="font-medium text-gray-800">{current?.rep_id ?? currentRepId}</div>
          <div className="text-xs text-gray-500">{current?.territory_name} · {current?.state}</div>
        </div>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {reps.map(rep => (
            <button
              key={rep.rep_id}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 transition-colors ${rep.rep_id === currentRepId ? 'bg-green-50 text-green-800 font-medium' : 'text-gray-700'}`}
              onClick={() => { onSelect(rep.rep_id, rep.territory_id); setOpen(false); }}
            >
              <div className="font-medium">{rep.rep_id}</div>
              <div className="text-xs text-gray-400">{rep.territory_name} · {rep.district}, {rep.state}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
