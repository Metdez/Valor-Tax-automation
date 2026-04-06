"use client";

import { Inter } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const navLinks = [
  { href: "/", label: "Dashboard", icon: "\u{1F4CA}" },
  { href: "/officers", label: "Officers", icon: "\u{1F465}" },
  { href: "/activity", label: "Activity", icon: "\u{1F4CB}" },
  { href: "/errors", label: "Errors", icon: "\u26A0\uFE0F" },
  { href: "/lookup", label: "Case Lookup", icon: "\u{1F50D}" },
];

export default function RootLayout({ children }) {
  const pathname = usePathname();

  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Mobile top nav */}
        <nav className="md:hidden bg-navy text-white px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-lg font-bold tracking-tight">
              Valor Tax Relief
            </span>
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm whitespace-nowrap ${
                    isActive
                      ? "bg-navy-dark border-b-2 border-accent"
                      : "hover:bg-navy-light"
                  }`}
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="flex min-h-screen">
          {/* Desktop sidebar */}
          <aside className="hidden md:flex md:flex-col md:w-60 bg-navy text-white flex-shrink-0">
            <div className="px-5 py-6 border-b border-navy-light">
              <h1 className="text-xl font-bold tracking-tight">
                Valor Tax Relief
              </h1>
              <p className="text-xs text-gray-300 mt-1">Operations Dashboard</p>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      isActive
                        ? "bg-navy-dark border-l-3 border-accent text-white"
                        : "text-gray-300 hover:bg-navy-light hover:text-white"
                    }`}
                  >
                    <span className="text-lg">{link.icon}</span>
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="px-5 py-4 border-t border-navy-light">
              <p className="text-xs text-gray-400">GHL Integration v1.0</p>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 p-6 md:p-8 bg-gray-50 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
