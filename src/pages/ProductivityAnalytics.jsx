import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import { TrendingUp, Users, Activity, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/lib/PermissionsContext';
import { useProjectFilter } from '@/lib/ProjectFilterContext';
import { format, parse } from 'date-fns';
import { api } from '@/lib/api';
import FilterPill from '@/components/common/FilterPill';

export default function ProductivityAnalytics() {
  const { hasAccessToProject, userRole } = usePermissions();
  const { selectedProject, setSelectedProject } = useProjectFilter();
  const [selectedCrew, setSelectedCrew] = useState('all');
  const [selectedActivity, setSelectedActivity] = useState('all');
  const [sortBy, setSortBy] = useState('productivity');

  const { data: dailyLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['dailyLogs'],
    queryFn: () => api.get('/daily-logs'),
  });

  const { data: masterItems = [] } = useQuery({
    queryKey: ['masterItems'],
    queryFn: () => api.get('/master-items'),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects'),
  });

  const handleProjectChange = (project) => {
    setSelectedProject(project === 'all' ? '' : project);
    setSelectedCrew('all');
    setSelectedActivity('all');
  };

  // Filtrar proyectos según permisos
  const filteredProjects = userRole === 'admin'
    ? projects
    : projects.filter(p => hasAccessToProject(p.name));

  // Logs filtrados por obra y acceso
  const projectLogs = useMemo(() => {
    return dailyLogs.filter(log => {
      const matchesAccess = userRole === 'admin' || hasAccessToProject(log.project);
      if (!matchesAccess) return false;
      if (selectedProject && selectedProject !== 'all' && log.project !== selectedProject) return false;
      return true;
    });
  }, [dailyLogs, selectedProject, userRole, hasAccessToProject]);

  // Obtener cuadrillas y actividades únicas según obra seleccionada
  const crewNames = useMemo(() => {
    return [...new Set(projectLogs.map(l => l.crew_name).filter(Boolean))];
  }, [projectLogs]);

  const uniqueActivities = useMemo(() => {
    return [...new Set(projectLogs.map(l => l.activity).filter(Boolean))];
  }, [projectLogs]);

  const selectedLogs = useMemo(() => {
    return projectLogs.filter(log => {
      if (selectedCrew !== 'all' && log.crew_name !== selectedCrew) return false;
      if (selectedActivity !== 'all' && log.activity !== selectedActivity) return false;
      return true;
    });
  }, [projectLogs, selectedCrew, selectedActivity]);

  const totals = useMemo(() => {
    const executed = selectedLogs.reduce((sum, log) => sum + (log.executed_today || 0), 0);
    const hours = selectedLogs.reduce((sum, log) => sum + (log.hours_worked || 0), 0);

    return {
      executed,
      hours,
      reports: selectedLogs.length,
      productivity: hours > 0 ? (executed / hours).toFixed(2) : null,
    };
  }, [selectedLogs]);

  // Datos de productividad por fecha
  const productivityByDate = useMemo(() => {
    const grouped = {};

    selectedLogs.forEach(log => {
      const dateStr = log.date;
      if (!grouped[dateStr]) {
        grouped[dateStr] = { date: dateStr, label: '', hours: 0, executed: 0, items: 0, workers: new Set() };
      }
      grouped[dateStr].hours += log.hours_worked || 0;
      grouped[dateStr].executed += log.executed_today || 0;
      grouped[dateStr].items += 1;
      log.crew_workers?.forEach(w => grouped[dateStr].workers.add(w.name));
    });

    return Object.entries(grouped)
      .map(([date, data]) => ({
        ...data,
        label: format(parse(date, 'yyyy-MM-dd', new Date()), 'MMM dd'),
        productivity: data.executed > 0 && data.hours > 0 ? parseFloat((data.executed / data.hours).toFixed(2)) : null,
        workers: data.workers.size,
      }))
      .sort((a, b) => parse(a.date, 'yyyy-MM-dd', new Date()) - parse(b.date, 'yyyy-MM-dd', new Date()))
      .slice(-30); // Últimos 30 días
  }, [selectedLogs]);

  // Datos por cuadrilla (crew_name)
  const crewProductivity = useMemo(() => {
    const crews = {};

    selectedLogs.forEach(log => {
      const isStoppage = Boolean(
        log.is_zero_progress ||
        (Number(log.executed_today) === 0 && Number(log.hours_worked) === 0 && log.has_restriction)
      );

      const crewName = log.crew_name || 'Sin cuadrilla asignada';
      if (!crews[crewName]) {
        crews[crewName] = {
          name: crewName,
          supervisor: log.supervisor,
          hours: 0,
          executed: 0,
          days: 0,
          stoppageDays: 0,
          items: []
        };
      }
      crews[crewName].hours += log.hours_worked || 0;
      crews[crewName].executed += log.executed_today || 0;
      if (!isStoppage) {
        crews[crewName].days += 1;
      } else {
        crews[crewName].stoppageDays += 1;
      }
      crews[crewName].items.push({ date: log.date, qty: log.executed_today });
    });

    return Object.values(crews)
      .map(crew => ({
        ...crew,
        productivity: crew.hours > 0 ? (crew.executed / crew.hours).toFixed(2) : 0,
        avgPerDay: crew.days > 0 ? (crew.executed / crew.days).toFixed(1) : (0).toFixed(1),
      }))
      .sort((a, b) => {
        if (sortBy === 'productivity') return b.productivity - a.productivity;
        if (sortBy === 'hours') return b.hours - a.hours;
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return 0;
      });
  }, [selectedLogs, sortBy]);

  // Datos acumulativos de avance
  const cumulativeProgress = useMemo(() => {
    let cumulative = 0;
    return productivityByDate.map(item => {
      cumulative += parseFloat(item.executed);
      return { ...item, cumulative: cumulative.toFixed(1) };
    });
  }, [productivityByDate]);

  // Datos de productividad individual por trabajador
  const workerProductivity = useMemo(() => {
    const workers = {};

    selectedLogs.forEach(log => {
      const isStoppage = Boolean(
        log.is_zero_progress ||
        (Number(log.executed_today) === 0 && Number(log.hours_worked) === 0 && log.has_restriction)
      );

      log.crew_workers?.forEach(w => {
        if (!w.name) return;
        const isWorkerExcluded =
          isStoppage ||
          Boolean(w.exclude_from_metrics) ||
          (Number(w.hours || 0) === 0 && Number(w.executed || 0) === 0 && isStoppage);

        const key = `${w.name}|${w.role}`;
        if (!workers[key]) {
          workers[key] = {
            name: w.name,
            role: w.role,
            crew: log.crew_name,
            hours: 0,
            executed: 0,
            days: 0,
            stoppageDays: 0,
          };
        }
        workers[key].hours += w.hours || 0;
        workers[key].executed += w.executed || 0;
        if (!isWorkerExcluded) {
          workers[key].days += 1;
        } else {
          workers[key].stoppageDays += 1;
        }
      });
    });

    return Object.values(workers)
      .map(w => ({
        ...w,
        productivity: w.hours > 0 ? (w.executed / w.hours).toFixed(2) : 0,
        avgPerDay: w.days > 0 ? (w.executed / w.days).toFixed(1) : (0).toFixed(1),
      }))
      .sort((a, b) => b.executed - a.executed);
  }, [selectedLogs]);

  if (logsLoading) {
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
          <TrendingUp className="w-5 h-5 text-accent" />
          Estadísticas de Productividad
        </h1>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <FilterPill
          label="Obra"
          value={selectedProject || 'all'}
          options={filteredProjects.map((p) => p.name)}
          onChange={handleProjectChange}
        />

        <FilterPill
          label="Cuadrilla"
          value={selectedCrew}
          options={crewNames}
          onChange={setSelectedCrew}
        />

        <FilterPill
          label="Actividad"
          value={selectedActivity}
          options={uniqueActivities}
          onChange={setSelectedActivity}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Productividad Promedio</p>
                <p className="text-2xl font-bold mt-1">
                  {totals.productivity ?? '—'}
                  <span className="text-sm text-muted-foreground">/h</span>
                </p>
              </div>
              <Activity className="w-8 h-8 text-accent/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Ejecutado</p>
                <p className="text-2xl font-bold mt-1">
                  {totals.executed}
                </p>
              </div>
              <Zap className="w-8 h-8 text-accent/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Horas Totales</p>
                <p className="text-2xl font-bold mt-1">
                  {totals.hours}h
                </p>
              </div>
              <Users className="w-8 h-8 text-accent/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Reportes</p>
                <p className="text-2xl font-bold mt-1">{totals.reports}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-accent/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info sobre cálculo de productividad */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
        <p className="text-xs text-blue-700">
          <strong>📊 Cálculo de Productividad:</strong> Se calcula como <strong>unidades ejecutadas ÷ horas trabajadas</strong>.
          Ej: Si 3 trabajadores hacen 12 unidades en 6 horas = 2 unidades/hora.
          <strong> Límites legales: máximo 10h/día, 42h/semana.</strong>
        </p>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Productividad por fecha */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Productividad en el Tiempo (unidades/h)</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Últimos 30 días. Fórmula: ejecutado ÷ horas = unidades/hora</p>
          </CardHeader>
          <CardContent>
            {productivityByDate.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos disponibles</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={productivityByDate}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Line type="monotone" dataKey="productivity" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ fill: 'hsl(var(--chart-1))' }} connectNulls={true} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Avance acumulativo */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Avance Acumulativo</CardTitle>
          </CardHeader>
          <CardContent>
            {cumulativeProgress.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos disponibles</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={cumulativeProgress}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="cumulative" fill="hsl(var(--chart-2))" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Ejecución diaria */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Ejecución Diaria vs Horas Trabajadas</CardTitle>
          </CardHeader>
          <CardContent>
            {productivityByDate.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos disponibles</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={productivityByDate}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Legend />
                  <Bar dataKey="executed" fill="hsl(var(--chart-3))" name="Ejecutado" />
                  <Bar dataKey="hours" fill="hsl(var(--chart-4))" name="Horas" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Relación produktividad-personal */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Productividad vs Personal</CardTitle>
          </CardHeader>
          <CardContent>
            {productivityByDate.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos disponibles</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="workers" name="Personas" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="productivity" name="Productividad (/h)" tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter name="Productividad" data={productivityByDate} fill="hsl(var(--chart-1))" />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabla de productividad individual */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Productividad Individual por Trabajador</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Rendimiento de cada integrante: unidades ejecutadas ÷ horas trabajadas</p>
        </CardHeader>
        <CardContent>
          {workerProductivity.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin datos disponibles. Registra personal en los reportes diarios.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2">Nombre</th>
                    <th className="text-left px-3 py-2">Rol</th>
                    <th className="text-left px-3 py-2 text-muted-foreground">Cuadrilla</th>
                    <th className="text-right px-3 py-2">Jornadas</th>
                    <th className="text-right px-3 py-2">Ejecutado Total</th>
                    <th className="text-right px-3 py-2">Horas</th>
                    <th className="text-right px-3 py-2">Productividad</th>
                    <th className="text-right px-3 py-2">Prom/Día</th>
                  </tr>
                </thead>
                <tbody>
                  {workerProductivity.map((w, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{w.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{w.role || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground text-[11px]">{w.crew || '—'}</td>
                      <td className="px-3 py-2 text-right">{w.days}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{w.executed}</td>
                      <td className="px-3 py-2 text-right">{w.hours}h</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-accent">{w.productivity} /h</td>
                      <td className="px-3 py-2 text-right">{w.avgPerDay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabla de cuadrillas */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Productividad por Cuadrilla (unidades/hora)</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Fórmula: Total Ejecutado ÷ Horas Trabajadas = Productividad/h</p>
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 w-[220px] text-xs">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="productivity">Ordenar por productividad</SelectItem>
                <SelectItem value="hours">Ordenar por horas</SelectItem>
                <SelectItem value="name">Ordenar por nombre</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {crewProductivity.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin datos disponibles</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2">Cuadrilla</th>
                    <th className="text-left px-3 py-2 text-muted-foreground">Supervisor</th>
                    <th className="text-right px-3 py-2">Jornadas</th>
                    <th className="text-right px-3 py-2">Ejecutado</th>
                    <th className="text-right px-3 py-2">Horas</th>
                    <th className="text-right px-3 py-2">Productividad</th>
                    <th className="text-right px-3 py-2">Prom/Día</th>
                  </tr>
                </thead>
                <tbody>
                  {crewProductivity.map((crew, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{crew.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{crew.supervisor || '—'}</td>
                      <td className="px-3 py-2 text-right">{crew.days}</td>
                      <td className="px-3 py-2 text-right font-mono">{crew.executed}</td>
                      <td className="px-3 py-2 text-right">{crew.hours}h</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-accent">{crew.productivity} /h</td>
                      <td className="px-3 py-2 text-right">{crew.avgPerDay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}