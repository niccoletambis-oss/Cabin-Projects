"use client";
import { useState } from "react";
import { auditFlag } from "@/lib/inventory-status";
export function AuditCount({
  id,
  expected,
  actual,
  condition,
  remarks,
  conditions,
}: {
  id: string;
  expected: number;
  actual: number;
  condition: string;
  remarks: string;
  conditions: string[];
}) {
  const [count, setCount] = useState(actual);
  const [state, setState] = useState(condition);
  return (
    <>
      <input type="hidden" name="lineId" value={id} />
      <label>
        Actual quantity
        <input
          name={`count-${id}`}
          type="number"
          min={0}
          max={1000000}
          required
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </label>
      <label>
        Condition
        <select
          name={`condition-${id}`}
          value={state}
          onChange={(e) => setState(e.target.value)}
        >
          {conditions.map((c) => (
            <option key={c} value={c}>
              {c.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <p className="audit-difference" role="status">
        Difference: {count - expected} · {auditFlag(expected, count, state)}
      </p>
      <label>
        Remarks
        <input name={`remarks-${id}`} defaultValue={remarks} maxLength={2000} />
      </label>
    </>
  );
}
