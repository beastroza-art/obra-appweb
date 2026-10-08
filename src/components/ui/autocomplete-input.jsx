import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

export function AutocompleteInput({
  value,
  onChange,
  options = [],
  placeholder,
  className,
  ...props
}) {
  const [suggestion, setSuggestion] = useState("");

  useEffect(() => {
    if (value) {
      const match = options.find((opt) =>
        opt.toLowerCase().startsWith(value.toLowerCase())
      );
      setSuggestion(match || "");
    } else {
      setSuggestion("");
    }
  }, [value, options]);

  const handleChange = (e) => {
    onChange(e);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Tab" && suggestion && suggestion.toLowerCase() !== value.toLowerCase()) {
      e.preventDefault();
      // Simulate an onChange event
      const syntheticEvent = {
        ...e,
        target: { ...e.target, value: suggestion },
      };
      onChange(syntheticEvent);
    }
    if (props.onKeyDown) {
      props.onKeyDown(e);
    }
  };

  return (
    <div className="relative flex items-center w-full">
      {suggestion && suggestion.toLowerCase().startsWith(value.toLowerCase()) && value ? (
        <div 
          className={`absolute inset-0 flex items-center px-3 pointer-events-none z-0 text-muted-foreground/60 overflow-hidden whitespace-nowrap ${className || ""}`}
          style={{ paddingTop: '1px' }}
        >
          <span className="opacity-0">{value}</span>
          <span>{suggestion.slice(value.length)}</span>
        </div>
      ) : null}
      <Input
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`bg-transparent relative z-10 ${className || ""}`}
        {...props}
      />
    </div>
  );
}