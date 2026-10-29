"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, LayoutDashboard, Package, Menu } from "lucide-react";
import { can, type Actor, type Permission } from "@/lib/permissions";
import { useState } from "react";
const navigation: {
  group: string;
  links: { href: string; label: string; permission?: Permission }[];
}[] = [
  { group: "Dashboard", links: [{ href: "/", label: "Overview" }] },
  {
    group: "Inventory",
    links: [
      { href: "/inventory", label: "All items" },
      { href: "/low-stock", label: "Low stock / restock" },
      { href: "/transactions", label: "Stock transactions" },
    ],
  },
  {
    group: "Property",
    links: [
      { href: "/rooms", label: "Room inventory", permission: "rooms:view" },
      { href: "/linen", label: "Linen & laundry", permission: "linen" },
      { href: "/bookings", label: "Guest stays", permission: "booking:view" },
      {
        href: "/inspections",
        label: "Arrival / departure checks",
        permission: "inspection",
      },
      { href: "/audits", label: "Inventory audits" },
      { href: "/damage", label: "Damage & missing" },
    ],
  },
  {
    group: "Purchasing",
    links: [
      { href: "/charges", label: "Guest charges", permission: "charge:review" },
      { href: "/expenses", label: "Expenses", permission: "expense:submit" },
      {
        href: "/purchases",
        label: "Purchase requests",
        permission: "purchase:create",
      },
      { href: "/suppliers", label: "Suppliers", permission: "suppliers" },
    ],
  },
  {
    group: "Management",
    links: [
      { href: "/users", label: "Users", permission: "users" },
      { href: "/activity", label: "Activity log", permission: "logs" },
      { href: "/reports", label: "Reports", permission: "reports" },
      { href: "/settings", label: "Settings" },
    ],
  },
];
export function Shell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: Actor;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "menu-open" : ""}`}>
        <Link href="/" className="brand">
          <span className="brand-icon">
            <House size={26} />
          </span>
          <span>
            cabin<span className="brand-sub">BED & BREAKFAST</span>
          </span>
        </Link>
        <nav className="full-navigation">
          {navigation.map((group) => {
            const links = group.links.filter(
              (l) => !l.permission || can(user.role, l.permission),
            );
            return links.length ? (
              <div key={group.group}>
                <div className="workspace-label">{group.group}</div>
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={
                      path === link.href ? "nav-link active" : "nav-link"
                    }
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ) : null;
          })}
        </nav>
        <div className="profile">
          <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </div>
        </div>
        <form action="/api/logout" method="post">
          <button className="button">Sign out</button>
        </form>
      </aside>
      <main>
        <header className="topbar">
          <span>
            <span className="live-dot" />
            Cabin operations
          </span>
          <span className="phase-tag">PHASE 03 · {user.role}</span>
        </header>
        {children}
        <footer>
          Made for the everyday care of your cabin.
          <span>Cabin Operations · PHP</span>
        </footer>
      </main>
      <nav className="mobile-nav">
        <Link href="/">
          <LayoutDashboard size={20} />
          Home
        </Link>
        <Link href="/inventory">
          <Package size={20} />
          Stock
        </Link>
        <Link href="/damage?type=DAMAGE">Report issue</Link>
        <Link href="/audits">Check</Link>
        <button
          className="mobile-menu-button"
          aria-expanded={open}
          aria-label="Open navigation"
          onClick={() => setOpen(!open)}
        >
          <Menu size={20} />
          Menu
        </button>
      </nav>
    </div>
  );
}
