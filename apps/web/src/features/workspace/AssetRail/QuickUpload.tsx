import { useState } from "react";
import { Upload } from "lucide-react";
import {
  uploadWorkspaceMaterial,
  workspaceMaterialFileRejectionReason,
} from "../../../lib/api/client.js";

export function QuickUpload({
  workspaceId,
  onUploaded,
}: {
  workspaceId: string;
  onUploaded(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <>
      <label className={`quick-upload ${busy ? "quick-upload--busy" : ""}`}>
        <Upload size={14} /> 上传素材
        <input
          type="file"
          hidden
          multiple
          accept="image/*,video/*"
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            e.currentTarget.value = "";
            if (files.length === 0) return;

            const rejected = files
              .map((file) => ({
                file,
                reason: workspaceMaterialFileRejectionReason(file),
              }))
              .filter((item): item is { file: File; reason: string } =>
                Boolean(item.reason),
              );
            const accepted = files.filter(
              (file) => !workspaceMaterialFileRejectionReason(file),
            );
            setMessage(
              rejected.length > 0
                ? rejected
                    .map((item) => `${item.file.name}: ${item.reason}`)
                    .join("；")
                : null,
            );
            if (accepted.length === 0) return;

            setBusy(true);
            try {
              for (const file of accepted) {
                await uploadWorkspaceMaterial({ workspaceId, file });
              }
              onUploaded();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : String(error));
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {message ? <p className="asset-rail__hint">{message}</p> : null}
    </>
  );
}
