'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Single source of truth for the currently selected rep + territory across
 * pages. Backed by localStorage so a rep chosen on /dashboard persists when
 * the user navigates to /anomalies, /retailer/[id], etc.
 *
 * Default falls back to REP_0001 / TER_0001 if nothing has been selected yet.
 */

const REP_KEY = 'selected_rep_id';
const TER_KEY = 'selected_territory_id';
const DEFAULT_REP = 'REP_0001';
const DEFAULT_TER = 'TER_0001';

interface SelectedRep {
  repId: string;
  territoryId: string;
  setRep: (repId: string, territoryId: string) => void;
  /** True once we've hydrated from localStorage. Useful for skeleton states. */
  hydrated: boolean;
}

export function useSelectedRep(): SelectedRep {
  const [repId, setRepId] = useState<string>(DEFAULT_REP);
  const [territoryId, setTerritoryId] = useState<string>(DEFAULT_TER);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const r = localStorage.getItem(REP_KEY);
    const t = localStorage.getItem(TER_KEY);
    if (r) setRepId(r);
    if (t) setTerritoryId(t);
    setHydrated(true);
  }, []);

  // Listen for changes from other tabs / other components on the same page
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === REP_KEY && e.newValue) setRepId(e.newValue);
      if (e.key === TER_KEY && e.newValue) setTerritoryId(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setRep = useCallback((rid: string, tid: string) => {
    localStorage.setItem(REP_KEY, rid);
    localStorage.setItem(TER_KEY, tid);
    setRepId(rid);
    setTerritoryId(tid);
    // Same-tab listeners don't get `storage` events, dispatch one manually
    window.dispatchEvent(new StorageEvent('storage', { key: REP_KEY, newValue: rid }));
    window.dispatchEvent(new StorageEvent('storage', { key: TER_KEY, newValue: tid }));
  }, []);

  return { repId, territoryId, setRep, hydrated };
}
