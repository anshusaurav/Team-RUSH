interface Props {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}

export default function StatCard({ label, value, sub, highlight }: Props) {
  return (
    <div
      className={`rounded-xl p-3.5 border text-center transition-colors ${
        highlight ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200 hover:border-green-200'
      }`}
    >
      <div
        className={`font-display text-2xl font-bold tracking-tight leading-none ${
          highlight ? 'text-red-600' : 'text-green-700'
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mt-1.5">
        {label}
      </div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
