import { db } from "./db";
import { authorize, hashPassword, type Actor } from "./security";
import { z } from "zod";
import {
  ItemCondition,
  ItemStatus,
  DamageStatus,
  ReportType,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
const count = z.coerce.number().int().min(0).max(1_000_000);
const positive = count.refine((v) => v > 0, "Must be positive");
const text = z.string().trim().max(2000);
const name = z.string().trim().min(2).max(120);
const cost = z.coerce
  .number()
  .min(0)
  .max(1_000_000)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001,
    "Use two decimal places",
  );
export const conditions = Object.values(ItemCondition);
const log = (
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  entityId: string,
  details: string,
) =>
  tx.activityLog.create({
    data: { userId: actor.id, role: actor.role, action, entityId, details },
  });
export async function saveUser(actor: Actor, input: unknown) {
  authorize(actor, "users");
  const data = z
    .object({
      id: z.string().optional(),
      name,
      email: z
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
      role: z.enum(["ADMIN", "MANAGER", "CARETAKER"]),
      active: z.boolean(),
      password: z.string().max(128).optional(),
    })
    .parse(input);
  const passwordHash = data.password
    ? await hashPassword(data.password)
    : undefined;
  if (!data.id && !passwordHash)
    throw new Error("A password is required for new accounts");
  return db.$transaction(async (tx) => {
    // Serialize account changes so concurrent requests cannot remove every active owner.
    await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(493061)`;
    if (data.id === actor.id && (!data.active || data.role !== "ADMIN"))
      throw new Error("You cannot deactivate or demote your own account");
    const old = data.id
      ? await tx.user.findUniqueOrThrow({ where: { id: data.id } })
      : null;
    if (
      old?.role === "ADMIN" &&
      old.active &&
      (!data.active || data.role !== "ADMIN") &&
      (await tx.user.count({ where: { role: "ADMIN", active: true } })) <= 1
    )
      throw new Error("Keep at least one active Admin");
    const fields = {
      name: data.name,
      email: data.email,
      role: data.role,
      active: data.active,
      ...(passwordHash
        ? { passwordHash, failedLogins: 0, lockedUntil: null }
        : {}),
    };
    const user = old
      ? await tx.user.update({ where: { id: old.id }, data: fields })
      : await tx.user.create({ data: fields });
    if (old) await tx.session.deleteMany({ where: { userId: old.id } });
    await log(
      tx,
      actor,
      old ? "USER_UPDATED" : "USER_CREATED",
      user.id,
      `${old ? "Updated" : "Created"} ${user.name}; role ${user.role}${passwordHash ? "; password set/reset" : ""}`,
    );
    return user;
  });
}
export async function saveSupplier(actor: Actor, input: unknown) {
  authorize(actor, "suppliers");
  const { id, ...data } = z
    .object({
      id: z.string().optional(),
      name,
      contactPerson: text,
      phone: z.string().trim().max(40),
      email: z.union([z.email().max(254), z.literal("")]),
      address: text,
      notes: text,
      active: z.boolean(),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const supplier = id
      ? await tx.supplier.update({ where: { id }, data })
      : await tx.supplier.create({ data });
    await log(
      tx,
      actor,
      "SUPPLIER_CHANGED",
      supplier.id,
      `${supplier.name}: ${supplier.active ? "active" : "archived"}`,
    );
    return supplier;
  });
}
export async function editItem(actor: Actor, input: unknown) {
  authorize(actor, "inventory:edit");
  const { id, ...data } = z
    .object({
      id: z.string().min(1),
      name,
      sku: z
        .string()
        .trim()
        .min(2)
        .max(40)
        .regex(/^[a-zA-Z0-9_-]+$/)
        .transform((v) => v.toUpperCase()),
      description: text,
      brand: text,
      unit: z.string().trim().min(1).max(20),
      minimumStock: count,
      reorderQuantity: count,
      unitCost: cost,
      categoryId: z.string().min(1),
      locationId: z.string().min(1),
      supplierId: z.string().nullable(),
      condition: z.nativeEnum(ItemCondition),
      status: z.nativeEnum(ItemStatus),
      datePurchased: z.coerce.date().nullable(),
      notes: text,
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const item = await tx.inventoryItem.update({ where: { id }, data });
    await log(
      tx,
      actor,
      "ITEM_UPDATED",
      id,
      `Edited ${item.name}; stock and history preserved`,
    );
    return item;
  });
}
export async function createDamage(
  actor: Actor,
  input: unknown,
  photo?: { data: Buffer; contentType: string },
) {
  authorize(actor, "stock");
  const data = z
    .object({
      itemId: z.string().min(1),
      type: z.nativeEnum(ReportType),
      quantity: positive,
      locationId: z.string().min(1),
      description: z.string().trim().min(3).max(2000),
      estimatedCost: cost.optional(),
    })
    .parse(input);
  if (actor.role === "CARETAKER" && data.estimatedCost !== undefined)
    throw new Error("Permission denied");
  if (
    photo &&
    (photo.data.length > 2 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(photo.contentType))
  )
    throw new Error("Photo must be JPEG, PNG or WebP, up to 2 MB");
  return db.$transaction(async (tx) => {
    const report = await tx.damageReport.create({
      data: {
        ...data,
        userId: actor.id,
        photos: photo
          ? {
              create: {
                contentType: photo.contentType,
                data: new Uint8Array(photo.data),
              },
            }
          : undefined,
      },
    });
    await log(
      tx,
      actor,
      "DAMAGE_REPORTED",
      report.id,
      `${data.type}: ${data.description}`,
    );
    return report;
  });
}
export async function reviewDamage(actor: Actor, input: unknown) {
  authorize(actor, "review");
  const { id, ...data } = z
    .object({
      id: z.string(),
      status: z.nativeEnum(DamageStatus),
      managementRemarks: text,
      estimatedCost: cost,
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const report = await tx.damageReport.update({
      where: { id },
      data: {
        ...data,
        resolvedAt: ["REPLACED", "WRITTEN_OFF", "RESOLVED"].includes(
          data.status,
        )
          ? new Date()
          : null,
      },
    });
    await log(
      tx,
      actor,
      "DAMAGE_REVIEWED",
      id,
      `${data.status}: ${data.managementRemarks}`,
    );
    return report;
  });
}
export async function startAudit(
  actor: Actor,
  locationId: string | null,
  note: string,
  assigneeId?: string,
) {
  authorize(actor, "audit");
  if (assigneeId && assigneeId !== actor.id) authorize(actor, "review");
  if (note.length > 2000) throw new Error("Remarks too long");
  return db.$transaction(async (tx) => {
    if (assigneeId) {
      const assignee = await tx.user.findUniqueOrThrow({
        where: { id: assigneeId },
      });
      if (!assignee.active) throw new Error("Assigned user is inactive");
    }
    if (locationId)
      await tx.location.findUniqueOrThrow({ where: { id: locationId } });
    const items = await tx.inventoryItem.findMany({
      where: { status: "ACTIVE", ...(locationId ? { locationId } : {}) },
    });
    if (!items.length) throw new Error("No active items in this scope");
    const audit = await tx.inventoryAudit.create({
      data: {
        userId: assigneeId || actor.id,
        locationId,
        note,
        lines: {
          create: items.map((i) => ({
            itemId: i.id,
            expectedQuantity: i.quantity,
            countedQuantity: i.quantity,
            condition: i.condition,
          })),
        },
      },
    });
    await log(
      tx,
      actor,
      "AUDIT_STARTED",
      audit.id,
      `Started audit of ${items.length} items`,
    );
    return audit;
  });
}
export async function completeAudit(actor: Actor, id: string, input: unknown) {
  authorize(actor, "audit");
  const lines = z
    .array(
      z.object({
        id: z.string(),
        countedQuantity: count,
        condition: z.nativeEnum(ItemCondition),
        remarks: text,
      }),
    )
    .min(1)
    .max(10000)
    .parse(input);
  return db.$transaction(async (tx) => {
    const audit = await tx.inventoryAudit.findUniqueOrThrow({
      where: { id },
      include: { lines: true },
    });
    if (actor.role === "CARETAKER" && audit.userId !== actor.id)
      throw new Error("Permission denied");
    if (audit.status !== "IN_PROGRESS")
      throw new Error("Audit already completed");
    if (
      new Set(lines.map((l) => l.id)).size !== audit.lines.length ||
      lines.length !== audit.lines.length ||
      lines.some((l) => !audit.lines.some((a) => a.id === l.id))
    )
      throw new Error("All audit lines must be included once");
    const changed = await tx.inventoryAudit.updateMany({
      where: { id, status: "IN_PROGRESS" },
      data: { status: "FOR_REVIEW", completedAt: new Date(), userId: actor.id },
    });
    if (changed.count !== 1) throw new Error("Audit already completed");
    for (const { id: lineId, ...data } of lines)
      await tx.auditLine.update({ where: { id: lineId }, data });
    await log(
      tx,
      actor,
      "AUDIT_COMPLETED",
      id,
      "Count submitted for review; stock unchanged",
    );
  });
}
export async function reviewAudit(
  actor: Actor,
  id: string,
  remarks: string,
  adjust: boolean,
) {
  authorize(actor, "review");
  if (remarks.trim().length < 3 || remarks.length > 2000)
    throw new Error("Explain the review or adjustment");
  return db.$transaction(async (tx) => {
    const audit = await tx.inventoryAudit.findUniqueOrThrow({
      where: { id },
      include: { lines: true },
    });
    const changed = await tx.inventoryAudit.updateMany({
      where: { id, status: "FOR_REVIEW" },
      data: {
        status: adjust ? "ADJUSTED" : "REVIEWED",
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewRemarks: remarks,
      },
    });
    if (changed.count !== 1) throw new Error("Audit must be awaiting review");
    if (adjust)
      for (const line of audit.lines) {
        const delta = line.countedQuantity - line.expectedQuantity;
        // Reject stale counts instead of erasing movements made after the audit snapshot.
        const result = await tx.inventoryItem.updateMany({
          where: {
            id: line.itemId,
            quantity: line.expectedQuantity,
            updatedAt: { lte: audit.createdAt },
          },
          data: { quantity: line.countedQuantity, condition: line.condition },
        });
        if (result.count !== 1)
          throw new Error(
            "Inventory changed since audit began. Review without adjusting and start a new audit.",
          );
        if (delta)
          await tx.stockTransaction.create({
            data: {
              itemId: line.itemId,
              type: delta > 0 ? "IN" : "OUT",
              quantity: Math.abs(delta),
              note: `Audit adjustment ${id}: ${remarks}`,
              userId: actor.id,
            },
          });
      }
    await log(
      tx,
      actor,
      adjust ? "INVENTORY_ADJUSTMENT" : "AUDIT_REVIEWED",
      id,
      remarks,
    );
  });
}
export { stockLevel, suggestedOrder } from "./inventory-status";
export async function createPurchase(actor: Actor, input: unknown) {
  authorize(actor, "purchase:create");
  const data = z
    .object({
      supplierId: z.string().min(1),
      notes: text,
      status: z.enum(["DRAFT", "FOR_APPROVAL"]),
      lines: z
        .array(
          z.object({
            itemId: z.string().min(1),
            quantity: positive,
            unitCost: cost,
          }),
        )
        .min(1)
        .max(1000),
    })
    .parse(input);
  if (new Set(data.lines.map((l) => l.itemId)).size !== data.lines.length)
    throw new Error("Select each item only once");
  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUniqueOrThrow({
      where: { id: data.supplierId },
    });
    if (!supplier.active) throw new Error("Supplier is archived");
    const request = await tx.purchase.create({
      data: {
        reference: `PR-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        supplierId: data.supplierId,
        notes: data.notes,
        status: data.status,
        requestedById: actor.id,
        lines: { create: data.lines },
      },
    });
    await log(
      tx,
      actor,
      "PURCHASE_REQUEST",
      request.id,
      `${request.reference}: ${data.status}`,
    );
    return request;
  });
}
export async function transitionPurchase(
  actor: Actor,
  id: string,
  nextStatus: string,
) {
  const status = z
    .enum(["FOR_APPROVAL", "APPROVED", "PURCHASED", "RECEIVED", "CANCELLED"])
    .parse(nextStatus);
  authorize(
    actor,
    status === "APPROVED"
      ? "purchase:approve"
      : status === "RECEIVED"
        ? "purchase:receive"
        : "purchase:create",
  );
  const sources: Record<string, string[]> = {
    FOR_APPROVAL: ["DRAFT"],
    APPROVED: ["FOR_APPROVAL"],
    PURCHASED: ["APPROVED"],
    RECEIVED: ["APPROVED", "PURCHASED"],
    CANCELLED: ["DRAFT", "FOR_APPROVAL", "APPROVED", "PURCHASED"],
  };
  if (!sources[status]) throw new Error("Invalid purchase transition");
  return db.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUniqueOrThrow({
      where: { id },
      include: { lines: true },
    });
    if (!sources[status].includes(purchase.status))
      throw new Error("Purchase status no longer allows this action");
    // Row-level conditional claim and all stock effects share one transaction.
    const claimed = await tx.purchase.updateMany({
      where: { id, status: purchase.status, receivedAt: null },
      data: {
        status,
        ...(status === "APPROVED"
          ? { approvedById: actor.id, approvedAt: new Date() }
          : {}),
        ...(status === "RECEIVED"
          ? { receivedById: actor.id, receivedAt: new Date() }
          : {}),
      },
    });
    if (claimed.count !== 1) throw new Error("Purchase already processed");
    if (status === "RECEIVED")
      for (const line of purchase.lines) {
        const result = await tx.inventoryItem.updateMany({
          where: {
            id: line.itemId,
            quantity: { lte: 1_000_000 - line.quantity },
          },
          data: { quantity: { increment: line.quantity } },
        });
        if (result.count !== 1)
          throw new Error("Stock limit exceeded; receiving rolled back");
        await tx.stockTransaction.create({
          data: {
            itemId: line.itemId,
            type: "IN",
            quantity: line.quantity,
            userId: actor.id,
            note: `Received ${purchase.reference}`,
          },
        });
        await log(
          tx,
          actor,
          "STOCK_IN",
          line.itemId,
          `${line.quantity} units received from ${purchase.reference}`,
        );
      }
    await log(
      tx,
      actor,
      `PURCHASE_${status}`,
      id,
      `${purchase.reference}: ${status}`,
    );
  });
}
