'use client';

import { useEffect, useState } from 'react';
import { getReps, Rep } from '@/lib/api';
import Link from 'next/link';
import { MapPin, ChevronRight } from 'lucide-react';

export default function RepsPage() {
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getReps().then(d => setReps(d.reps)).finally(() => setLoading(false));
  }, []);

  const filtered = reps.filter(r =>
    r.rep_id.toLowerCase().includes(search.toLowerCase()) ||
    r.territory_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.state?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Field Reps</h1>
        <p className="text-sm text-gray-500">{reps.length} reps across all territories</p>
      </div>

      <input
        placeholder="Search by rep ID, territory, or state..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-green-400"
      />

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 50).map(rep => (
            <Link
              key={rep.rep_id}
              href={`/dashboard?repId=${rep.rep_id}&territoryId=${rep.territory_id}`}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3 hover:border-green-400 hover:shadow-sm transition-all"
            >
              <div>
                <div className="font-semibold text-gray-800 text-sm">{rep.rep_id}</div>
                <div className="text-xs text-gray-500 mt-0.5">{rep.territory_name}</div>
                <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                  <MapPin size={10} /> {rep.district}, {rep.state}
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </Link>
          ))}
          {filtered.length > 50 && (
            <p className="text-xs text-center text-gray-400">Showing 50 of {filtered.length} — refine your search</p>
          )}
        </div>
      )}
    </div>
  );
}
