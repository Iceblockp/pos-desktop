import { useState, useRef, useEffect, useMemo } from "react";

export interface OptionItem<T = string> {
  label: string;
  value: T;
  icon?: string;
  subtitle?: string;
}

export interface OptionPickerProps<T = string> {
  label?: string;
  info?: string;
  value: T | null;
  options: OptionItem<T>[];
  placeholder?: string;
  onSelect: (val: T) => void;
  onAddNew?: () => void;
  addNewLabel?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}

export function OptionPicker<T = string>({
  label,
  info,
  value,
  options,
  placeholder = "မရွေးချယ်ရသေးပါ",
  onSelect,
  onAddNew,
  addNewLabel = "+ အသစ်ထည့်မည်",
  searchPlaceholder = "ရှာဖွေရန်...",
  disabled = false,
  className = "",
}: OptionPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedItem = useMemo(() => {
    return options.find((opt) => opt.value === value) ?? null;
  }, [options, value]);

  const showSearch = options.length > 5;

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.subtitle && opt.subtitle.toLowerCase().includes(q))
    );
  }, [options, search]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      // Auto-focus search input
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const handleToggle = () => {
    if (disabled) return;
    setSearch("");
    setOpen((prev) => !prev);
  };

  const handleSelect = (val: T) => {
    onSelect(val);
    setOpen(false);
  };

  const handleAddNew = () => {
    setOpen(false);
    onAddNew?.();
  };

  return (
    <div className={`form-control relative ${className}`} ref={containerRef}>
      {label ? (
        <label className="label py-1 flex items-center justify-between">
          <span className="label-text text-xs font-semibold flex items-center gap-1.5">
            {label}
            {info ? (
              <span
                className="tooltip tooltip-right cursor-pointer text-slate-400 hover:text-slate-600 font-normal"
                data-tip={info}
              >
                ℹ️
              </span>
            ) : null}
          </span>
        </label>
      ) : null}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`input input-bordered input-sm w-full flex items-center justify-between text-left transition-colors cursor-pointer ${
          disabled ? "bg-slate-100 cursor-not-allowed text-slate-400" : "bg-white"
        } ${open ? "border-primary ring-1 ring-primary" : ""}`}
      >
        <span
          className={`truncate text-xs ${
            selectedItem ? "font-medium text-slate-800" : "text-slate-400"
          }`}
        >
          {selectedItem?.icon ? `${selectedItem.icon} ` : ""}
          {selectedItem?.label ?? placeholder}
        </span>
        <span className="text-[10px] text-slate-400 ml-2">▼</span>
      </button>

      {/* Dropdown Popover */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col max-h-72 animate-in fade-in zoom-in-95 duration-100">
          {/* Search Header */}
          {showSearch && (
            <div className="p-2 border-b border-slate-100 bg-slate-50/70">
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="input input-bordered input-xs w-full text-xs"
              />
            </div>
          )}

          {/* Options Scrollable List */}
          <div className="overflow-y-auto p-1.5 space-y-0.5 flex-1">
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">
                ရှာမတွေ့ပါ
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors text-left ${
                      isSelected
                        ? "bg-primary/10 text-primary font-bold"
                        : "hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    <div className="truncate flex items-center gap-1.5">
                      {opt.icon && <span>{opt.icon}</span>}
                      <span>{opt.label}</span>
                      {opt.subtitle && (
                        <span className="text-[10px] opacity-75 font-normal ml-1">
                          ({opt.subtitle})
                        </span>
                      )}
                    </div>
                    {isSelected && <span className="text-primary font-bold">✓</span>}
                  </button>
                );
              })
            )}
          </div>

          {/* Bottom Add Action */}
          {onAddNew && (
            <div className="p-2 border-t border-slate-100 bg-slate-50 flex justify-center">
              <button
                type="button"
                onClick={handleAddNew}
                className="btn btn-xs btn-outline btn-primary w-full gap-1 text-xs"
              >
                <span>➕</span>
                <span>{addNewLabel}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
