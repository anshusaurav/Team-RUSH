'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getReps, getRepLeaderboard, Rep, RepLeaderboardEntry } from '@/lib/api';
import { MapPin, ChevronRight, Search, Users } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { useSelectedRep } from '@/lib/useSelectedRep';

// ─── Helpers ─────────────────────────────────────────────────────────

// "kalaburagi_west_019" → "Kalaburagi West 019"
function prettifyTerritoryName(s: string | undefined): string {
  if (!s) return '';
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// "REP_0019" → "19"
function initials(repId: string): string {
  const m = repId.match(/(\d{1,4})$/);
  return m ? String(parseInt(m[1], 10)) : repId.slice(-2);
}

// Deterministic colour for a state — picks a soft HSL bg + matching text.
function stateColor(state: string | undefined): { bg: string; text: string; ring: string } {
  if (!state) return { bg: '#e5e7eb', text: '#374151', ring: 'rgba(107,114,128,0.25)' };
  let h = 0;
  for (let i = 0; i < state.length; i++) h = (h * 31 + state.charCodeAt(i)) % 360;
  return {
    bg:   `hsl(${h}, 55%, 92%)`,
    text: `hsl(${h}, 45%, 28%)`,
    ring: `hsla(${h}, 50%, 50%, 0.25)`,
  };
}

// ─── Page ────────────────────────────────────────────────────────────

export default function RepsPage() {
  const { t } = useLocale();
  const router = useRouter();
  const { repId: currentRepId, setRep } = useSelectedRep();
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('all'); // 'all' or a state name
  const [leaderboard, setLeaderboard] = useState<Map<string, RepLeaderboardEntry>>(new Map());

  // Full list of unique states (sorted), populated once reps load.
  const allStates = useMemo(() => {
    const set = new Set<string>();
    for (const r of reps) if (r.state) set.add(r.state);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reps]);

  useEffect(() => {
    getReps().then(d => setReps(d.reps ?? [])).finally(() => setLoading(false));
    // Load leaderboard in parallel — non-blocking; cards render first then stats fill in.
    getRepLeaderboard()
      .then(d => {
        const m = new Map<string, RepLeaderboardEntry>();
        d.leaderboard.forEach(e => m.set(e.rep_id, e));
        setLeaderboard(m);
      })
      .catch(() => {}); // stats are non-critical
  }, []);

  const handlePick = (rep: Rep) => {
    setRep(rep.rep_id, rep.territory_id);
    router.push('/dashboard');
  };

  // Filter (state dropdown + text search) + group by state.
  // When a specific state is selected, the per-state cap is dropped so the
  // user can see every rep in that state — that's the point of filtering.
  const { totalShown, totalRendered, byState } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = reps.filter(r => {
      if (stateFilter !== 'all' && r.state !== stateFilter) return false;
      if (!q) return true;
      return (
        r.rep_id.toLowerCase().includes(q) ||
        r.territory_name?.toLowerCase().includes(q) ||
        r.state?.toLowerCase().includes(q) ||
        r.district?.toLowerCase().includes(q)
      );
    });
    const map = new Map<string, Rep[]>();
    for (const r of filtered) {
      const key = r.state || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const cap = stateFilter === 'all' ? 24 : Infinity; // no cap when state-filtered
    const groups = Array.from(map.entries())
      .map(([state, reps]) => ({ state, reps: cap === Infinity ? reps : reps.slice(0, cap) }))
      .sort((a, b) => a.state.localeCompare(b.state));
    const rendered = groups.reduce((s, g) => s + g.reps.length, 0);
    return { totalShown: filtered.length, totalRendered: rendered, byState: groups };
  }, [reps, search, stateFilter]);

  return (
    <div className="page-shell space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-gray-900">
            {t('reps.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('reps.countLine', { count: reps.length })}
          </p>
        </div>
      </div>

      {/* Search + state filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            placeholder={t('reps.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm shadow-sm focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 transition-all"
          />
        </div>
        <div className="relative sm:w-48">
          <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            className="w-full appearance-none bg-white border border-gray-200 rounded-xl pl-9 pr-8 py-2.5 text-sm shadow-sm focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 transition-all cursor-pointer"
          >
            <option value="all">{t('reps.stateFilterAll')}</option>
            {allStates.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <ChevronRight
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none rotate-90"
          />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && totalShown === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl py-12 text-center">
          <Users size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">{t('reps.noMatches')}</p>
        </div>
      )}

      {/* Grouped rep grid */}
      {!loading && byState.map(group => {
        const color = stateColor(group.state);
        return (
          <section key={group.state} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: color.text }}
                />
                {group.state}
              </h2>
              <span className="text-xs text-gray-400 font-medium">
                {group.reps.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.reps.map(rep => {
                const isCurrent = rep.rep_id === currentRepId;
                const c = stateColor(rep.state);
                const lb = leaderboard.get(rep.rep_id);
                return (
                  <button
                    key={rep.rep_id}
                    onClick={() => handlePick(rep)}
                    className={`group flex items-center gap-3 text-left bg-white border rounded-xl p-3 transition-all hover:shadow-sm hover:-translate-y-px ${
                      isCurrent
                        ? 'border-green-500 ring-2 ring-green-100 shadow-sm'
                        : 'border-gray-200 hover:border-green-300'
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                      style={{ background: c.bg, color: c.text }}
                    >
                      {initials(rep.rep_id)}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-gray-900 text-sm truncate">
                          {prettifyTerritoryName(rep.territory_name)}
                        </div>
                        {isCurrent && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">
                        {rep.rep_id}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                        <MapPin size={10} />
                        <span className="truncate">{rep.district}</span>
                      </div>
                      {/* Leaderboard stats — appear once the async call resolves */}
                      {lb && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {lb.acceptance_rate_30d !== null ? (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              lb.acceptance_rate_30d >= 70 ? 'bg-green-100 text-green-700' :
                              lb.acceptance_rate_30d >= 40 ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-600'
                            }`}>
                              {lb.acceptance_rate_30d}% accept.
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400">No outcomes yet</span>
                          )}
                          {lb.coverage_efficiency_30d !== null && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
                              {lb.coverage_efficiency_30d}% coverage
                            </span>
                          )}
                          {lb.visits_this_week > 0 && (
                            <span className="text-[10px] text-gray-400">
                              {lb.visits_this_week} visits/wk
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-gray-300 group-hover:text-green-500 transition-colors shrink-0"
                    />
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Hint when the per-state cap is hiding reps (only in 'All states' mode) */}
      {!loading && stateFilter === 'all' && totalShown > totalRendered && (
        <p className="text-xs text-center text-gray-400 mt-2">
          {t('reps.showingHint', { shown: totalRendered, total: totalShown })}
        </p>
      )}
    </div>
  );
}
