import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Exports master items + daily logs as a CSV report
 */
export function exportReportCSV(masterItems, dailyLogs) {
  const rows = [];

  // Header
  rows.push([
    'Proyecto', 'Torre', 'Piso', 'Actividad', 'Cuadrilla',
    'Planificado', 'Ejecutado', '% Avance', 'Estado', 'Liberación',
    'Restricciones', 'Observaciones'
  ]);

  masterItems.forEach(item => {
    const pct = item.planned_qty > 0
      ? ((item.executed_qty || 0) / item.planned_qty * 100).toFixed(1)
      : '0.0';
    rows.push([
      item.project || '',
      item.tower || '',
      item.floor || '',
      item.activity || '',
      item.crew_name || '',
      item.planned_qty || 0,
      item.executed_qty || 0,
      `${pct}%`,
      item.status || '',
      item.release_status || '',
      item.restrictions || '',
      item.observations || ''
    ]);
  });

  rows.push([]);
  rows.push(['--- REPORTES DIARIOS ---']);
  rows.push([
    'Fecha', 'Proyecto', 'Torre', 'Piso', 'Actividad', 'Supervisor',
    'Ejecutado Hoy', 'Horas', 'Restricción', 'Detalle Restricción', 'Observaciones'
  ]);

  dailyLogs.forEach(log => {
    rows.push([
      log.date || '',
      log.project || '',
      log.tower || '',
      log.floor || '',
      log.activity || '',
      log.supervisor || '',
      log.executed_today || 0,
      log.hours_worked || 0,
      log.has_restriction ? 'Sí' : 'No',
      log.restriction_detail || '',
      log.observations || ''
    ]);

    // Personal del día
    if (log.crew_workers?.length) {
      log.crew_workers.forEach(w => {
        rows.push([
          '', '', '', '', `  └ ${w.name || ''}`, w.role || '',
          w.executed || 0, w.hours || 0, '', '', ''
        ]);
      });
    }
  });

  const csvContent = rows.map(r =>
    r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')
  ).join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `informe_obra_${format(new Date(), 'yyyy-MM-dd', { locale: es })}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}