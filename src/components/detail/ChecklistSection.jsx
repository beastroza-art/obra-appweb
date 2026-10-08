import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { CheckSquare } from 'lucide-react';

const DEFAULT_CHECKLIST = [
  'Base instalada',
  'Artefacto instalado',
  'Conexiones realizadas',
  'Fijación correcta',
  'Funcionamiento probado',
  'Limpieza final',
  'Revisado por supervisor',
];

export default function ChecklistSection({ entries = [], onToggle }) {
  const checklistMap = Object.fromEntries(
    entries.map((entry) => [entry.item_name, entry])
  );

  const completedCount = DEFAULT_CHECKLIST.filter(
    (itemName) => checklistMap[itemName]?.completed
  ).length;

  const totalCount = DEFAULT_CHECKLIST.length;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <CheckSquare className="h-4 w-4 text-accent" />
            Checklist Maestro
          </CardTitle>

          <Badge variant="secondary" className="text-xs">
            {completedCount}/{totalCount}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {DEFAULT_CHECKLIST.map((itemName) => {
            const entry = checklistMap[itemName];
            const isChecked = entry?.completed || false;

            return (
              <div
                key={itemName}
                className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted/50"
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => onToggle?.(itemName, entry)}
                />

                <div className="flex-1">
                  <p
                    className={`text-sm ${
                      isChecked
                        ? 'text-muted-foreground line-through'
                        : 'text-foreground'
                    }`}
                  >
                    {itemName}
                  </p>

                  {entry?.completed_date && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {entry.completed_by || 'Sin usuario'} —{' '}
                      {entry.completed_date}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}