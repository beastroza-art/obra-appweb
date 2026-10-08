import * as React from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function AutocompleteSelect({
  value,
  onChange,
  options = [],
  placeholder = "Seleccionar...",
  disabled = false,
  className = "",
  ...props
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const containerRef = React.useRef(null);
  const inputRef = React.useRef(null);

  // Sincronizar texto de búsqueda con el valor seleccionado cuando se cierra
  React.useEffect(() => {
    if (!isOpen) {
      setSearch(value || "");
    }
  }, [value, isOpen]);

  // Cerrar al hacer clic fuera del componente
  React.useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const normalizeText = (text) =>
    String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const filteredOptions = React.useMemo(() => {
    const query = normalizeText(search);
    if (!query) return options;
    return options.filter((opt) => normalizeText(opt).includes(query));
  }, [search, options]);

  // Ajustar el índice resaltado cuando cambia la búsqueda
  React.useEffect(() => {
    setHighlightedIndex((prev) => {
      if (filteredOptions.length === 0) return -1;
      if (prev >= filteredOptions.length) return filteredOptions.length - 1;
      return prev === -1 ? 0 : prev;
    });
  }, [filteredOptions]);

  const handleSelect = (option) => {
    onChange(option);
    setSearch(option);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % filteredOptions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + filteredOptions.length) % filteredOptions.length);
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          handleSelect(filteredOptions[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
      case "Tab":
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      <div className="relative flex items-center w-full">
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
            if (!e.target.value) {
              onChange("");
            }
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-10 text-xs bg-background"
          {...props}
        />
        <div className="absolute right-2 flex items-center gap-1">
          {search && !disabled && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                onChange("");
                inputRef.current?.focus();
              }}
              className="text-muted-foreground hover:text-foreground focus:outline-none"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!disabled) {
                setIsOpen(!isOpen);
                inputRef.current?.focus();
              }
            }}
            className="text-muted-foreground hover:text-foreground focus:outline-none"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-input bg-popover p-1 shadow-md text-popover-foreground animate-in fade-in-0 zoom-in-95">
          {filteredOptions.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No se encontraron actividades
            </div>
          ) : (
            filteredOptions.map((option, index) => {
              const isSelected = value === option;
              const isHighlighted = highlightedIndex === index;

              return (
                <div
                  key={`${option}-${index}`}
                  className={cn(
                    "relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none transition-colors cursor-pointer",
                    isHighlighted && "bg-accent text-accent-foreground",
                    isSelected && "font-semibold text-primary bg-primary/5"
                  )}
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {option}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
