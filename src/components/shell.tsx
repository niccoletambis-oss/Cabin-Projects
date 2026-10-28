"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  LayoutDashboard,
  Package,
  Sprout,
  ArrowUpRight,
} from "lucide-react";
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <House size={26} />
          </span>
          <span>
            cabin<span className="brand-sub">BED & BREAKFAST</span>
          </span>
        </Link>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {[
            { href: "/", label: "Overview", icon: LayoutDashboard },
            { href: "/inventory", label: "Inventory", icon: Package },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={path === href ? "nav-link active" : "nav-link"}
            >
              <Icon size={19} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <Sprout size={25} />
          <strong>A little care, every day.</strong>
          <p>Keep your cabin stocked and every guest feeling at home.</p>
        </div>
        <div className="profile">
          <span className="avatar">CC</span>
          <div>
            <strong>Cabin Caretaker</strong>
            <small>Local development workspace</small>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            <span className="live-dot" /> Cabin operations
          </span>
          <span className="phase-tag">
            PHASE 01 <ArrowUpRight size={13} />
          </span>
        </header>
        {children}
        <footer>
          Made for the everyday care of your cabin.{" "}
          <span>Cabin Inventory · PHP</span>
        </footer>
      </main>
      <nav className="mobile-nav">
        <Link href="/">
          <LayoutDashboard size={20} />
          Overview
        </Link>
        <Link href="/inventory">
          <Package size={20} />
          Inventory
        </Link>
      </nav>
    </div>
  );
}
