export const metadata = { title: "Private file retention | Cabin" };
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { securityAction } from "@/app/security-actions";
export default async function Storage() {
  await requireUser("users");
  const files = await db.storedFile.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalName: true,
      size: true,
      state: true,
      createdAt: true,
      cleanupPending: true,
    },
  });
  return (
    <div className="page">
      <h1>Private file retention</h1>
      <p>
        Historical inspection, damage and financial evidence is protected.
        Archiving hides eligible evidence and retains its bytes for recovery.
      </p>
      {files.map((file) => (
        <section key={file.id} className="panel operation-card">
          <h2>{file.originalName}</h2>
          <p>
            {file.state} · {Math.ceil(file.size / 1024)} KB ·{" "}
            {file.createdAt.toISOString().slice(0, 10)}
            {file.cleanupPending ? " · Storage cleanup pending" : ""}
          </p>
          {["READY", "ARCHIVED"].includes(file.state) && (
            <ActionForm
              handler={securityAction}
              intent={
                file.state === "ARCHIVED" ? "restore-file" : "archive-file"
              }
              label={
                file.state === "ARCHIVED" ? "Restore file" : "Archive file"
              }
            >
              <input type="hidden" name="id" value={file.id} />
              <label>
                Confirm your password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
            </ActionForm>
          )}
        </section>
      ))}
    </div>
  );
}
