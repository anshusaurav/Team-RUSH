'use client';

import { AIProvider } from '@/lib/api';

interface Props {
  value: AIProvider;
  onChange: (p: AIProvider) => void;
}

export default function ProviderToggle({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
      {(['gemini', 'claude'] as AIProvider[]).map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            value === p ? 'bg-green-700 text-white' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          {p === 'gemini' ? '✦ Gemini' : '◆ Claude'}
        </button>
      ))}
    </div>
  );
}
