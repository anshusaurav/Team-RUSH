'use client';

import { AIProvider } from '@/lib/api';

interface Props {
  value: AIProvider;
  onChange: (p: AIProvider) => void;
}

// Claude API key is not configured in this deployment — disable selection
// to prevent erroring calls. The toggle still renders so the dual-provider
// architecture is visible; Claude just shows as unavailable.
const DISABLED_PROVIDERS: AIProvider[] = ['claude'];

export default function ProviderToggle({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
      {(['gemini', 'claude'] as AIProvider[]).map(p => {
        const disabled = DISABLED_PROVIDERS.includes(p);
        const active   = value === p && !disabled;
        return (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(p)}
            title={disabled ? 'API key not configured in this deployment' : undefined}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors
              ${active   ? 'bg-green-700 text-white' : ''}
              ${!active && !disabled ? 'text-gray-500 hover:bg-gray-100' : ''}
              ${disabled ? 'text-gray-300 cursor-not-allowed line-through' : ''}
            `}
          >
            {p === 'gemini' ? '✦ Gemini' : '◆ Claude'}
          </button>
        );
      })}
    </div>
  );
}
