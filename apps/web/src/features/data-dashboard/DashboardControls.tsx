import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

/** Segmented metric toggle (ROAS / CVR / CTR …). */
export function DashboardSegmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="dash-seg" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={"dash-seg-item" + (option.value === value ? " is-active" : "")}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Filter dropdown with click-outside dismiss — ported from the design `Dropdown`. */
export function DashboardDropdown({
  label,
  value,
  valueLabel,
  options,
  onChange,
  icon: Icon,
  minWidth,
}: {
  label: string;
  value: string;
  valueLabel?: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  icon?: LucideIcon;
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const display = valueLabel ?? options.find((option) => option.value === value)?.label ?? value;

  return (
    <div className="dash-dd" ref={ref} style={minWidth ? { minWidth } : undefined}>
      <button
        type="button"
        className={"dash-dd-btn" + (open ? " is-open" : "")}
        onClick={() => setOpen((prev) => !prev)}
      >
        {Icon ? <Icon size={15} strokeWidth={1.7} /> : null}
        <span className="dash-dd-label">{label}</span>
        <span className="dash-dd-value">{display}</span>
        <ChevronDown size={14} strokeWidth={1.8} />
      </button>
      {open ? (
        <div className="dash-dd-menu">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={"dash-dd-item" + (option.value === value ? " is-active" : "")}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check size={15} strokeWidth={2} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
