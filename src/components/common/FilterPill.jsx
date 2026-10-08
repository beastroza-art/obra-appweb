import { Badge } from '@/components/ui/badge';
import { ChevronDown, Check } from 'lucide-react';
import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export default function FilterPill({ label, value, placeholder = 'Todas', options = [], onChange }) {
  const active = Boolean(value && value !== 'all');
  const selectedOption = options.find((option) => {
    const optionValue = typeof option === 'string' ? option : option.value;
    return optionValue === value;
  });
  const displayValue = selectedOption
    ? typeof selectedOption === 'string'
      ? selectedOption
      : selectedOption.label
    : value === 'all' ? '' : value;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={[
            'h-10 justify-between gap-3 rounded-lg border-slate-200 bg-white px-3 text-left text-xs shadow-sm w-full sm:w-auto min-w-[140px]',
            active ? 'border-primary/30 bg-primary/5 text-primary' : 'text-slate-700',
          ].join(' ')}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
              {label}
            </span>
            <span className="max-w-[160px] truncate font-semibold">
              {displayValue || placeholder}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[min(92vw,360px)] p-3 z-50">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-foreground">{label}</p>
            <p className="text-[11px] text-muted-foreground">Selecciona una opcion</p>
          </div>
          {active && (
            <Badge variant="secondary" className="bg-primary/10 text-[11px] text-primary">
              Activo
            </Badge>
          )}
        </div>

        <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
          <Button
            type="button"
            variant={!value || value === 'all' ? 'default' : 'outline'}
            size="sm"
            className="h-8 justify-start rounded-md px-2 text-xs"
            onClick={() => onChange('all')}
          >
            {(!value || value === 'all') && <Check className="mr-1.5 h-3 w-3" />}
            {placeholder}
          </Button>

          {options.map((option) => {
            const optionValue = typeof option === 'string' ? option : option.value;
            const optionLabel = typeof option === 'string' ? option : option.label;
            const selected = value === optionValue;

            return (
              <Button
                key={optionValue}
                type="button"
                variant={selected ? 'default' : 'outline'}
                size="sm"
                className="h-8 justify-start rounded-md px-2 text-xs"
                title={optionLabel}
                onClick={() => onChange(optionValue)}
              >
                {selected && <Check className="mr-1.5 h-3 w-3" />}
                <span className="truncate">{optionLabel}</span>
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}