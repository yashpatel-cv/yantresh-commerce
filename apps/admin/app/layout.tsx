import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Yantresh Commerce — Control Plane",
  description: "Phase 1 admin shell — tenant config, domains, theme"
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/tenants", label: "Tenants" },
  { href: "/domains", label: "Domains" },
  { href: "/theme", label: "Theme / Config" },
  { href: "/status", label: "Status" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <p className="sidebar-brand">
              Yantresh Commerce
              <span>Control Plane</span>
            </p>
            <nav>
              <ul>
                {NAV.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href}>{label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
            <p className="sidebar-footer">Phase 1 shell<br />Payload deferred → Phase 2</p>
          </aside>
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
