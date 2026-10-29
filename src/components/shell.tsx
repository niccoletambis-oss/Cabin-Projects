"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, LayoutDashboard, Package, Menu } from "lucide-react";
import { can, type Actor, type Permission } from "@/lib/permissions";
import { useState, useEffect, useRef } from "react";
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
  const menu = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) menu.current?.showModal();
    else menu.current?.close();
  }, [open]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 761px)");
    const close = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);
  const active = (href: string) =>
    path === href || (href !== "/" && path.startsWith(href + "/"));
  const content = (
    <>
      <Link href="/" className="brand">
        <span className="brand-icon">
          <House size={26} />
        </span>
        <span>
          cabin<span className="brand-sub">BED & BREAKFAST</span>
        </span>
      </Link>
      <nav className="full-navigation" aria-label="Main navigation">
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
                  aria-current={active(link.href) ? "page" : undefined}
                  className={active(link.href) ? "nav-link active" : "nav-link"}
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
    </>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">{content}</aside>
      <dialog
        className="navigation-dialog"
        id="mobile-navigation"
        ref={menu}
        aria-label="Navigation"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className="sidebar">
          <button
            type="button"
            className="button"
            onClick={() => setOpen(false)}
          >
            Close navigation
          </button>
          {content}
        </div>
      </dialog>
      <main id="main-content" tabIndex={-1}>
        <header className="topbar">
          <span>
            <span className="live-dot" />
            Cabin operations
          </span>
          <span className="phase-tag">
            {user.role === "ADMIN"
              ? "Owner"
              : user.role === "MANAGER"
                ? "Manager"
                : "Caretaker"}
          </span>
        </header>
        {children}
        <footer>
          Made for the everyday care of your cabin.
          <span>Cabin Operations · PHP</span>
        </footer>
      </main>
      <nav className="mobile-nav" aria-label="Quick actions">
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
          aria-controls="mobile-navigation"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen(!open)}
        >
          <Menu size={20} />
          Menu
        </button>
      </nav>
    </div>
  );
}
