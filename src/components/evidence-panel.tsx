import { db } from "@/lib/db";
import type { PrivateParent } from "@/lib/file-access";
import { ActionForm } from "./action-form";
import { securityAction } from "@/app/security-actions";
export async function EvidencePanel({ parent }: { parent: PrivateParent }) {
  const attachments = await db.privateAttachment.findMany({
    where: parent,
    include: { storedFile: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <section className="panel operation-card">
      <h2>Private evidence</h2>
      {attachments
        .filter((a) => a.storedFile.state === "READY")
        .map((a) => (
          <p key={a.id}>
            <a
              href={`/api/files/${a.storedFileId}`}
              target="_blank"
              rel="noreferrer"
            >
              {a.storedFile.originalName}
            </a>{" "}
            · {Math.ceil(a.storedFile.size / 1024)} KB
          </p>
        ))}
      <ActionForm
        intent="private-evidence"
        handler={securityAction}
        label="Attach evidence"
      >
        {Object.entries(parent).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value ?? ""} />
        ))}
        <label>
          Photo{parent.purchaseId ? " or PDF receipt" : ""} (up to 2 MB)
          <input
            type="file"
            name="file"
            accept={
              parent.purchaseId
                ? "image/jpeg,image/png,image/webp,application/pdf"
                : "image/jpeg,image/png,image/webp"
            }
            required
          />
        </label>
      </ActionForm>
    </section>
  );
}
