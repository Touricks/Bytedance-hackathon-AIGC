import { Check } from "lucide-react";

/** Bottom-center success toast, auto-dismissed by the view model. */
export function DashboardToast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="dash-toast" role="status">
      <Check size={16} strokeWidth={2.4} />
      {message}
    </div>
  );
}
