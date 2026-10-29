"use client";
import { useState } from "react";
import { inspectionFlags, stayConditions } from "@/lib/stay-status";
export function InspectionCount({
  line,
}: {
  line: {
    id: string;
    expectedQuantity: number;
    actualQuantity: number;
    condition: string;
    baselineQuantity: number | null;
    baselineCondition: string | null;
    notes: string | null;
  };
}) {
  const [quantity, setQuantity] = useState(line.actualQuantity);
  const [condition, setCondition] = useState(line.condition);
  return (
    <>
      <input type="hidden" name="lineId" value={line.id} />
      <label>
        Actual quantity
        <input
          name={`quantity-${line.id}`}
          type="number"
          min={0}
          max={1000000}
          required
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </label>
      <label>
        Condition
        <select
          name={`condition-${line.id}`}
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
        >
          {stayConditions.map((c) => (
            <option key={c} value={c}>
              {c.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <p className="audit-difference" role="status">
        Difference from{" "}
        {line.baselineQuantity === null ? "expected" : "check-in"}:{" "}
        {quantity - (line.baselineQuantity ?? line.expectedQuantity)} ·{" "}
        {inspectionFlags(
          line.expectedQuantity,
          quantity,
          condition,
          line.baselineQuantity,
          line.baselineCondition,
        ).join(", ")}
      </p>
      <label>
        Item notes
        <input
          name={`notes-${line.id}`}
          defaultValue={line.notes ?? ""}
          maxLength={2000}
        />
      </label>
    </>
  );
}
