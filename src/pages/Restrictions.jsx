import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Link2,
  Calendar,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/lib/PermissionsContext';
import { useProjectFilter } from '@/lib/ProjectFilterContext';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import FilterPill from '@/components/common/FilterPill';
import { getFloorList } from '@/utils/floors';
import { getScopeDisplayLabel } from '@/constants/activityScope';

function formatRestrictionDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return String(dateStr);
  }
}

function RestrictionLocationDisplay({ project, tower, scopeLabel }) {
  const floors = getFloorList(scopeLabel);
  const visibleFloors = floors.slice(0, 4);
  const remainingCount = floors.length - visibleFloors.length;

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 flex-wrap">
      <span className="font-semibold text-slate-700">{project || '—'}</span>
      <span>•</span>
      <span>{tower || '—'}</span>
      <span>/</span>
      {floors.length === 0 ? (
        <span>—</span>
      ) : (
        <div className="inline-flex items-center gap-1 flex-wrap" title={floors.join(', ')}>
          {visibleFloors.map((fl) => (
            <span
              key={fl}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-foreground/80 border border-slate-200/60"
            >
              {fl}
            </span>
          ))}
          {remainingCount > 0 && (
            <span
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-foreground/80 border border-slate-200/60"
              title={floors.join(', ')}
            >
              +{remainingCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function Restrictions() {
  const navigate = useNavigate();
  const { hasAccessToProject, userRole } = usePermissions();
  const { selectedProject, setSelectedProject } = useProjectFilter();
  const [selectedActivity, setSelectedActivity] = useState('all');

  const { data: masterItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['masterItems'],
    queryFn: () => api.get('/master-items'),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects'),
  });

  const { data: dailyLogs = [] } = useQuery({
    queryKey: ['dailyLogs'],
    queryFn: () => api.get('/daily-logs'),
  });

  const filteredProjects =
    userRole === 'admin'
      ? projects
      : projects.filter((p) => hasAccessToProject(p.name));

  const activeRestrictions = [];

  // A) Ítems Maestros Principales con restricciones activas (excluyendo terminados)
  masterItems
    .filter((item) => !item.parent_id)
    .filter((item) => item.restrictions && item.restrictions.trim())
    .filter((item) => item.status !== 'completado' && !(item.planned_qty > 0 && Number(item.executed_qty) >= Number(item.planned_qty)))
    .filter((item) => userRole === 'admin' || hasAccessToProject(item.project))
    .filter(
      (item) => !selectedProject || selectedProject === 'all' || item.project === selectedProject
    )
    .forEach((item) => {
      activeRestrictions.push({
        id: item.id,
        type: 'item_maestro',
        project: item.project,
        tower: item.tower,
        scopeLabel: getScopeDisplayLabel(item, true),
        activity: item.activity,
        description: item.restrictions,
        // Criterio Ítem Maestro: CRÍTICA si el ítem está formalmente bloqueado, Normal si sigue en ejecución o pendiente
        severity: item.status === 'bloqueado' ? 'crítica' : 'normal',
        date: item.updated_date || item.created_date || item.created_at,
        relatedId: item.id,
      });
    });

  // B) Ítems Hijos con restricciones propias específicas (si no la tiene ya el padre)
  masterItems
    .filter((item) => item.parent_id)
    .filter((item) => item.restrictions && item.restrictions.trim())
    .filter((item) => item.status !== 'completado' && !(item.planned_qty > 0 && Number(item.executed_qty) >= Number(item.planned_qty)))
    .filter((item) => userRole === 'admin' || hasAccessToProject(item.project))
    .filter(
      (item) => !selectedProject || selectedProject === 'all' || item.project === selectedProject
    )
    .forEach((child) => {
      const parent = masterItems.find((p) => p.id === child.parent_id);
      if (!parent || !parent.restrictions || parent.restrictions.trim() !== child.restrictions.trim()) {
        activeRestrictions.push({
          id: child.id,
          type: 'item_maestro',
          project: child.project,
          tower: child.tower,
          scopeLabel: child.floor || 'Piso',
          activity: child.activity,
          description: child.restrictions,
          severity: child.status === 'bloqueado' ? 'crítica' : 'normal',
          date: child.updated_date || child.created_date || child.created_at,
          relatedId: child.id,
        });
      }
    });

  // C) Reportes Diarios con restricción
  const logRestrictions = dailyLogs
    .filter((log) => log.has_restriction && log.restriction_detail && log.restriction_detail.trim())
    .filter((log) => {
      // Excluir si la actividad asociada ya fue completada al 100%
      const related = masterItems.find((i) => i.id === log.master_item_id);
      if (related && (related.status === 'completado' || (related.planned_qty > 0 && Number(related.executed_qty) >= Number(related.planned_qty)))) {
        return false;
      }
      return true;
    })
    .filter((log) => userRole === 'admin' || hasAccessToProject(log.project))
    .filter(
      (log) => !selectedProject || selectedProject === 'all' || log.project === selectedProject
    )
    .map((log) => {
      const related = masterItems.find((i) => i.id === log.master_item_id);
      // Criterio Reporte Diario: CRÍTICA si avance del día fue 0 (paralizado), Normal si hubo avance parcial con dificultad
      const isCritical =
        Boolean(log.is_zero_progress) ||
        Number(log.executed_today) === 0 ||
        log.log_type === 'bloqueo';

      const scopeLabel = related
        ? getScopeDisplayLabel(related, true)
        : (log.floor || '—');

      return {
        id: log.id,
        type: 'reporte_diario',
        project: log.project,
        tower: log.tower || related?.tower,
        scopeLabel,
        activity: log.activity,
        description: log.restriction_detail,
        severity: isCritical ? 'crítica' : 'normal',
        date: log.date || log.created_at,
        relatedId: log.master_item_id,
      };
    });

  const allRestrictionsBase = [...activeRestrictions, ...logRestrictions].sort(
    (a, b) => new Date(b.date || 0) - new Date(a.date || 0)
  );

  const uniqueActivities = Array.from(
    new Set(allRestrictionsBase.map((r) => r.activity))
  )
    .filter(Boolean)
    .sort();

  const allRestrictions = allRestrictionsBase.filter(
    (r) => selectedActivity === 'all' || r.activity === selectedActivity
  );

  const stats = {
    total: allRestrictions.length,
    criticas: allRestrictions.filter((r) => r.severity === 'crítica').length,
    normales: allRestrictions.filter((r) => r.severity === 'normal').length,
  };

  const getSeverityIcon = (severity) => {
    if (severity === 'crítica') {
      return <AlertTriangle className="w-4 h-4" />;
    }
    return <AlertCircle className="w-4 h-4" />;
  };

  const getSeverityColor = (severity) => {
    if (severity === 'crítica') return 'bg-red-50 border-red-200';
    return 'bg-amber-50 border-amber-200';
  };

  const getSeverityBadgeColor = (severity) => {
    if (severity === 'crítica') return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-amber-100 text-amber-700 border-amber-200';
  };

  if (itemsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          Centro de Restricciones
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">
                  Restricciones Totales
                </p>
                <p className="text-2xl font-bold mt-1">{stats.total}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-slate-300" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Críticas</p>
                <p className="text-2xl font-bold text-red-600 mt-1">
                  {stats.criticas}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-300" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Normales</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">
                  {stats.normales}
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-amber-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <FilterPill
          label="Obra"
          value={selectedProject || 'all'}
          options={filteredProjects.map((p) => p.name)}
          onChange={(val) => setSelectedProject(val === 'all' ? '' : val)}
        />

        <FilterPill
          label="Actividad"
          value={selectedActivity}
          options={uniqueActivities}
          onChange={setSelectedActivity}
        />
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Restricciones Activas{' '}
            {selectedProject && selectedProject !== 'all' ? `— ${selectedProject}` : ''}
          </CardTitle>
        </CardHeader>

        <CardContent>
          {allRestrictions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
              <p className="text-sm text-muted-foreground">
                Sin restricciones activas
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {allRestrictions.map((restriction) => (
                <div
                  key={`${restriction.type}-${restriction.id}`}
                  className={`border rounded-lg p-4 ${getSeverityColor(
                    restriction.severity
                  )}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="mt-0.5 text-red-500 shrink-0">
                        {getSeverityIcon(restriction.severity)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-semibold text-sm">
                            {restriction.activity}
                          </p>
                          <Badge
                            className={`text-xs font-medium border ${getSeverityBadgeColor(
                              restriction.severity
                            )}`}
                          >
                            {restriction.severity === 'crítica'
                              ? 'CRÍTICA'
                              : 'Normal'}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-xs font-mono text-muted-foreground"
                          >
                            {restriction.type === 'item_maestro'
                              ? 'Ítem Maestro'
                              : 'Reporte Diario'}
                          </Badge>

                          {restriction.date && (
                            <span className="text-[11px] font-mono text-muted-foreground ml-auto flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatRestrictionDate(restriction.date)}
                            </span>
                          )}
                        </div>

                        <RestrictionLocationDisplay
                          project={restriction.project}
                          tower={restriction.tower}
                          scopeLabel={restriction.scopeLabel}
                        />

                        <p className="text-sm leading-relaxed">
                          {restriction.description}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5 shrink-0 w-full sm:w-auto"
                      onClick={() => navigate(`/item/${restriction.relatedId}`, { state: { from: "/restrictions" } })}
                    >
                      <Link2 className="w-3 h-3" />
                      Ir al Ítem
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
