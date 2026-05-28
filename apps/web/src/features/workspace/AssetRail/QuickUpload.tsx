import { useState } from "react";
import { Upload } from "lucide-react";
import { uploadWorkspaceMaterial } from "../../../lib/api/client.js";

export function QuickUpload({
  workspaceId,
  onUploaded,
}: {
  workspaceId: string;
  onUploaded(): void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <label className={`quick-upload ${busy ? "quick-upload--busy" : ""}`}>
      <Upload size={14} /> 上传素材
      <input
        type="file"
        hidden
        accept="image/*,video/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            await uploadWorkspaceMaterial({ workspaceId, file });
            onUploaded();
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}
