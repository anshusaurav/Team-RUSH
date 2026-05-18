'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, AlertTriangle, Users } from 'lucide-react';

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/anomalies', label: 'Alerts', icon: AlertTriangle },
  { href: '/reps', label: 'Reps', icon: Users },
];

export default function Navbar() {
  const pathname = usePathname();
  return (
    <nav className="bg-green-800 text-white shadow-md">
      <div className="max-w-2xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/dashboard" className="font-bold text-lg tracking-tight">
          🌱 Field Co-Pilot
        </Link>
        <div className="flex gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                pathname.startsWith(href)
                  ? 'bg-green-600 text-white'
                  : 'text-green-100 hover:bg-green-700'
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
