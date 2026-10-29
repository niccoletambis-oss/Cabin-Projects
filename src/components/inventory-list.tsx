"use client";
import Link from "next/link";
import { useState } from "react";
import { Search, Package } from "lucide-react";
import { stockLevel } from "@/lib/inventory-status";
import { money } from "@/lib/format";
type Item = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  minimumStock: number;
  unitCost: number | null;
  category: { name: string };
  location: { name: string };
};
export function InventoryList({
  items,
  showCosts = false,
}: {
  items: Item[];
  showCosts?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const filtered = items.filter(
    (i) =>
      `${i.name} ${i.sku} ${i.location.name}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!category || i.category.name === category) &&
      (!status ||
        (status === "low"
          ? i.quantity <= i.minimumStock
          : i.quantity > i.minimumStock)),
  );
  return (
    <section className="panel">
      <div className="filter-bar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search inventory"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items, SKU or room…"
          />
        </label>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {[...new Set(items.map((i) => i.category.name))].sort().map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Filter by stock status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All stock levels</option>
          <option value="low">Needs attention</option>
          <option value="good">In stock</option>
        </select>
      </div>
      <div className="table-wrap inventory-table">
        <table>
          <thead>
            <tr>
              <th>ITEM</th>
              <th>CATEGORY</th>
              <th>LOCATION</th>
              <th>ON HAND</th>
              {showCosts && <th>UNIT COST</th>}
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id}>
                <td>
                  <div className="item-cell">
                    <span className="item-icon">
                      <Package size={19} />
                    </span>
                    <div>
                      <strong>
                        <Link href={`/inventory/${i.id}`}>{i.name}</Link>
                      </strong>
                      <small>{i.sku}</small>
                    </div>
                  </div>
                </td>
                <td>{i.category.name}</td>
                <td>{i.location.name}</td>
                <td>
                  <strong>{i.quantity}</strong>{" "}
                  <span className="muted">{i.unit}</span>
                  <small>Min. {i.minimumStock}</small>
                </td>
                {showCosts && <td>{money(i.unitCost ?? 0)}</td>}
                <td>
                  <span
                    className={`badge ${i.quantity === 0 ? "empty" : i.quantity <= i.minimumStock ? "low" : "good"}`}
                  >
                    {stockLevel(i.quantity, i.minimumStock)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="inventory-cards">
        {filtered.map((i) => (
          <article className="inventory-card" key={i.id}>
            <h3>
              <Link href={`/inventory/${i.id}`}>{i.name}</Link>
            </h3>
            <small>
              {i.sku} · {i.category.name} · {i.location.name}
            </small>
            <p>
              <strong>
                {i.quantity} {i.unit}
              </strong>{" "}
              · Minimum {i.minimumStock}
            </p>
            {showCosts && <p>Unit cost {money(i.unitCost ?? 0)}</p>}
            <span
              className={`badge ${i.quantity === 0 ? "empty" : i.quantity <= i.minimumStock ? "low" : "good"}`}
            >
              {stockLevel(i.quantity, i.minimumStock)}
            </span>
            <p>
              <Link href={`/inventory/${i.id}`}>View item details →</Link>
            </p>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <Package />
          <h3>No items found</h3>
          <p>Try another search, or add your first inventory item.</p>
        </div>
      )}
      <div className="table-footer">
        Showing {filtered.length} of {items.length} items{" "}
        <span>Stock updates appear immediately after saving</span>
      </div>
    </section>
  );
}
