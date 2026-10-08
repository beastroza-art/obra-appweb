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
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/lib/PermissionsContext';
import { useProjectFilter } from '@/lib/ProjectFilterContext';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import FilterPill from '@/components/common/FilterPill';

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

  const activeRestrictions = masterItems
    .filter((item) => !item.parent_id)
    .filter((item) => item.restrictions && item.restrictions.trim())
    .filter((item) => userRole === 'admin' || hasAccessToProject(item.project))
    .filter(
      (item) => !selectedProject || selectedProject === 'all' || item.project === selectedProject
    )
    .map((item) => ({
      id: item.id,
      type: 'item_maestro',
      project: item.project,
      location: `${item.tower || '—'} / ${item.floor || '—'}`,
      activity: item.activity,
      description: item.restrictions,
      severity: item.status === 'bloqueado' ? 'crítica' : 'normal',
      date: item.updated_date || item.created_date || item.created_at,
      relatedId: item.id,
    }));

  const logRestrictions = dailyLogs
    .filter((log) => log.has_restriction && log.restriction_detail)
    .filter((log) => userRole === 'admin' || hasAccessToProject(log.project))
    .filter(
      (log) => !selectedProject || selectedProject === 'all' || log.project === selectedProject
    )
    .map((log) => ({
      id: log.id,
      type: 'reporte_diario',
      project: log.project,
      location: `${log.tower || '—'} / ${log.floor || '—'}`,
      activity: log.activity,
      description: log.restriction_detail,
      severity: 'crítica',
      date: log.date,
      relatedId: log.master_item_id,
    }));

  const allRestrictionsBase = [...activeRestrictions, ...logRestrictions].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
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
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-0.5 text-red-500">
                        {getSeverityIcon(restriction.severity)}
                      </div>

                      <div className="flex-1">
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
                        </div>

                        <p className="text-xs text-muted-foreground mb-2">
                          {restriction.project} • {restriction.location}
                        </p>

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