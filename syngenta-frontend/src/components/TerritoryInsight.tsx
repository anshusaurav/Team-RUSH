'use client';

/**
 * Territory-level AI intelligence panel for the Dashboard.
 *
 * Calls /api/next-best-action/territory-insight which returns an
 * LLM-generated markdown summary of the territory's health — stock
 * coverage gaps, demand hotspots, anomaly clusters, recommended
 * manager actions. Shows a distinct "manager view" alongside the
 * rep-level daily plan.
 */

import { useState } from 'react';
import { getTerritoryInsight } from '@/lib/api';
import { BrainCircuit, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ProviderToggle from './ProviderToggle';

interface Props {
  territoryId: string;
}

export default function TerritoryInsight({ territoryId }: Props) {
  const [open, setOpen] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [provider, setProvider] = useState<'gemini' | 'claude'>('gemini');
  const [providerUsed, setProviderUsed] = useState<'gemini' | 'claude'>('gemini');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async (p: 'gemini' | 'claude') => {
    setLoading(true);
    setError('');
    setInsight(null);
    try {
      const data = await getTerritoryInsight(territoryId, p);
      setInsight(data.insight);
      setProviderUsed(data.provider_used);
    } catch {
      setError('Could not generate territory analysis. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (!open) {
      setOpen(true);
      if (!insight && !loading) load(provider);
    } else {
      setOpen(false);
    }
  };

  const handleProviderChange = (p: 'gemini' | 'claude') => {
    setProvider(p);
    if (open) {
      setInsight(null);
      load(p);
    }
  };

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50 overflow-hidden">
      {/* Header — always visible, click to expand */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-purple-100/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BrainCircuit size={16} className="text-purple-700 shrink-0" />
          <span className="font-semibold text-purple-900 text-sm">Territory Intelligence</span>
          <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-purple-200 text-purple-700">
            AI
          </span>
          {!open && !insight && (
            <span className="text-xs text-purple-600 font-normal">
              · LLM-generated strategic overview for {territoryId}
            </span>
          )}
          {insight && !open && (
            <span className="text-xs text-purple-500">· analysis ready</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {open && (
            <div onClick={e => e.stopPropagation()}>
              <ProviderToggle value={provider} onChange={handleProviderChange} />
            </div>
          )}
          {open ? <ChevronUp size={16} className="text-purple-500 shrink-0" /> : <ChevronDown size={16} className="text-purple-500 shrink-0" />}
        </div>
      </button>

      {/* Body — only rendered when open */}
      {open && (
        <div className="border-t border-purple-200 px-4 py-3 bg-white">
          {loading && (
            <div className="flex items-center gap-2 text-purple-700 text-sm animate-pulse py-4 justify-center">
              <Sparkles size={14} className="animate-spin" />
              Analysing territory data…
            </div>
          )}

          {error && (
            <div className="text-red-600 text-sm py-2">{error}</div>
          )}

          {insight && (
            <>
              <div className="text-[10px] text-gray-400 mb-2 flex items-center gap-1">
                via {providerUsed === 'claude' ? '◆ Claude' : '✦ Gemini'} · just now
              </div>
              <div className="prose prose-sm max-w-none
                [&>h1]:text-base [&>h1]:font-bold [&>h1]:text-gray-900 [&>h1]:mt-3 [&>h1]:mb-1
                [&>h2]:text-sm [&>h2]:font-bold [&>h2]:text-purple-900 [&>h2]:mt-3 [&>h2]:mb-1 [&>h2]:uppercase [&>h2]:tracking-wider
                [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:text-gray-800 [&>h3]:mt-2 [&>h3]:mb-0.5
                [&>p]:text-sm [&>p]:text-gray-700 [&>p]:leading-relaxed [&>p]:mb-2
                [&>ul]:text-sm [&>ul]:text-gray-700 [&>ul]:space-y-1 [&>ul]:mb-2 [&>ul]:ml-4 [&>ul]:list-disc
                [&>ol]:text-sm [&>ol]:text-gray-700 [&>ol]:space-y-1 [&>ol]:mb-2 [&>ol]:ml-4 [&>ol]:list-decimal
                [&_strong]:text-gray-900 [&_strong]:font-semibold
                [&_hr]:border-purple-200 [&_hr]:my-3">
                <ReactMarkdown>{insight}</ReactMarkdown>
              </div>
              <button
                onClick={() => load(provider)}
                className="mt-3 text-xs text-purple-600 hover:text-purple-800 font-medium underline underline-offset-2"
              >
                Regenerate
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
