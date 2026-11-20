import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Link2,
  Search,
  Plus,
  Check,
  Printer,
  ShieldAlert,
  Clock,
  Layers,
  Sparkles,
  Building2,
  Calendar,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/lib/PermissionsContext';
import { useProjectFilter } from '@/lib/ProjectFilterContext';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import FilterPill from '@/components/common/FilterPill';
import {
  RESTRICTION_CATEGORIES,
  detectRestrictionCategory,
  formatRestrictionLocation,
  formatRestrictionDate,
} from '@/utils/restrictions';
import { QUICK_RESTRICTIONS } from '@/constants/predefinedRestrictions';
import { getScopeDisplayLabel } from '@/constants/activityScope';

export default function Restrictions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasAccessToProject, userRole } = usePermissions();
  const { selectedProject, setSelectedProject } = useProjectFilter();

  // Tab & Filters state
  const [activeTab, setActiveTab] = useState('activas'); // 'activas' | 'resueltas' | 'todas'
  const [selectedActivity, setSelectedActivity] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all'); // 'all' | 'crítica' | 'normal'
  const [selectedCategory, setSelectedCategory] = useState('all'); // 'all' | category.id
  const [selectedSource, setSelectedSource] = useState('all'); // 'all' | 'item_maestro' | 'reporte_diario'
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [resolvingRestriction, setResolvingRestriction] = useState(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newProject, setNewProject] = useState('');
  const [newMasterItemId, setNewMasterItemId] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [newSeverity, setNewSeverity] = useState('normal'); // 'normal' | 'crítica'
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Queries
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

  const filteredProjects = useMemo(() => {
    return userRole === 'admin'
      ? projects
      : projects.filter((p) => hasAccessToProject(p.name));
  }, [projects, userRole, hasAccessToProject]);

  // Build unified restrictions list
  const allRestrictions = useMemo(() => {
    const list = [];

    // 1. Master Items Restrictions
    // A) Parents
    masterItems
      .filter((item) => !item.parent_id)
      .filter((item) => item.restrictions && item.restrictions.trim())
      .filter((item) => userRole === 'admin' || hasAccessToProject(item.project))
      .forEach((item) => {
        const isResolved =
          item.status === 'completado' ||
          item.release_status === 'liberado' ||
          (Number(item.planned_qty) > 0 && Number(item.executed_qty) >= Number(item.planned_qty));

        const isCritical = item.status === 'bloqueado';
        const category = detectRestrictionCategory(item.restrictions);

        list.push({
          id: item.id,
          rawItem: item,
          type: 'item_maestro',
          project: item.project,
          tower: item.tower,
          floor: item.floor,
          activity: item.activity,
          description: item.restrictions,
          severity: isCritical ? 'crítica' : 'normal',
          category,
          isResolved,
          date: item.updated_date || item.created_date || item.created_at,
          relatedId: item.id,
          isChild: false,
        });
      });

    // B) Child items with distinct restrictions
    masterItems
      .filter((item) => item.parent_id)
      .filter((item) => item.restrictions && item.restrictions.trim())
      .filter((item) => userRole === 'admin' || hasAccessToProject(item.project))
      .forEach((child) => {
        const parent = masterItems.find((p) => p.id === child.parent_id);
        const parentHasSame = parent && parent.restrictions && parent.restrictions.trim() === child.restrictions.trim();

        // If parent has the exact same restriction, don't duplicate it 8 times; parent card covers it.
        // But if child has its own specific restriction or parent is empty, show it!
        if (!parentHasSame) {
          const isResolved =
            child.status === 'completado' ||
            child.release_status === 'liberado' ||
            (Number(child.planned_qty) > 0 && Number(child.executed_qty) >= Number(child.planned_qty));

          const isCritical = child.status === 'bloqueado';
          const category = detectRestrictionCategory(child.restrictions);

          list.push({
            id: child.id,
            rawItem: child,
            type: 'item_maestro',
            project: child.project,
            tower: child.tower,
            floor: child.floor,
            activity: child.activity,
            description: child.restrictions,
            severity: isCritical ? 'crítica' : 'normal',
            category,
            isResolved,
            date: child.updated_date || child.created_date || child.created_at,
            relatedId: child.id,
            isChild: true,
            parentId: child.parent_id,
          });
        }
      });

    // 2. Daily Logs Restrictions
    dailyLogs
      .filter((log) => (log.has_restriction && log.restriction_detail) || (!log.has_restriction && log.restriction_detail && log.observations?.includes('[Restricción levantada')))
      .filter((log) => userRole === 'admin' || hasAccessToProject(log.project))
      .forEach((log) => {
        const relatedItem = masterItems.find((i) => i.id === log.master_item_id);

        const isResolved =
          !log.has_restriction ||
          (relatedItem && (relatedItem.status === 'completado' || relatedItem.release_status === 'liberado'));

        const isCritical =
          Boolean(log.is_zero_progress) ||
          Number(log.executed_today) === 0 ||
          log.log_type === 'bloqueo';

        const category = detectRestrictionCategory(log.restriction_detail);

        list.push({
          id: log.id,
          rawLog: log,
          type: 'reporte_diario',
          project: log.project,
          tower: log.tower,
          floor: log.floor,
          activity: log.activity,
          description: log.restriction_detail,
          severity: isCritical ? 'crítica' : 'normal',
          category,
          isResolved,
          date: log.date || log.created_at,
          relatedId: log.master_item_id,
          crewName: log.crew_name,
          supervisor: log.supervisor,
          observations: log.observations,
        });
      });

    // Sort descending by date
    return list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [masterItems, dailyLogs, userRole, hasAccessToProject]);

  // Overall Stats (computed across current project filter)
  const stats = useMemo(() => {
    const projectScoped = allRestrictions.filter(
      (r) => !selectedProject || selectedProject === 'all' || r.project === selectedProject
    );

    const activas = projectScoped.filter((r) => !r.isResolved);
    const resueltas = projectScoped.filter((r) => r.isResolved);

    return {
      total: activas.length,
      criticas: activas.filter((r) => r.severity === 'crítica').length,
      normales: activas.filter((r) => r.severity === 'normal').length,
      resueltas: resueltas.length,
    };
  }, [allRestrictions, selectedProject]);

  // Filtered list
  const filteredRestrictions = useMemo(() => {
    return allRestrictions.filter((r) => {
      // 1. Project filter
      if (selectedProject && selectedProject !== 'all' && r.project !== selectedProject) {
        return false;
      }

      // 2. Tab filter (activas vs resueltas vs todas)
      if (activeTab === 'activas' && r.isResolved) return false;
      if (activeTab === 'resueltas' && !r.isResolved) return false;

      // 3. Activity filter
      if (selectedActivity !== 'all' && r.activity !== selectedActivity) return false;

      // 4. Severity filter
      if (selectedSeverity !== 'all' && r.severity !== selectedSeverity) return false;

      // 5. Category filter
      if (selectedCategory !== 'all' && r.category?.id !== selectedCategory) return false;

      // 6. Source filter
      if (selectedSource !== 'all' && r.type !== selectedSource) return false;

      // 7. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const loc = formatRestrictionLocation(r, masterItems).toLowerCase();
        const text = `${r.activity} ${r.description} ${r.project} ${loc} ${r.crewName || ''} ${r.supervisor || ''}`.toLowerCase();
        if (!text.includes(query)) return false;
      }

      return true;
    });
  }, [
    allRestrictions,
    selectedProject,
    activeTab,
    selectedActivity,
    selectedSeverity,
    selectedCategory,
    selectedSource,
    searchQuery,
    masterItems,
  ]);

  const uniqueActivities = useMemo(() => {
    const projectScoped = allRestrictions.filter(
      (r) => !selectedProject || selectedProject === 'all' || r.project === selectedProject
    );
    return Array.from(new Set(projectScoped.map((r) => r.activity))).filter(Boolean).sort();
  }, [allRestrictions, selectedProject]);

  // Resolution handler
  const handleConfirmResolution = async () => {
    if (!resolvingRestriction) return;
    setIsSubmittingResolution(true);

    try {
      const formattedDate = new Date().toLocaleDateString('es-CL');
      const noteAppend = resolutionNote.trim()
        ? `[Restricción levantada ${formattedDate}]: ${resolutionNote.trim()}`
        : `[Restricción levantada ${formattedDate}]`;

      if (resolvingRestriction.type === 'item_maestro') {
        const item = resolvingRestriction.rawItem;
        let crewMembers = item.crew_members;
        if (typeof crewMembers === 'string') {
          try {
            crewMembers = JSON.parse(crewMembers);
          } catch {
            crewMembers = [];
          }
        }

        const newObservations = item.observations
          ? `${item.observations}\n${noteAppend}`
          : noteAppend;

        const newStatus = item.status === 'bloqueado' ? 'en_ejecucion' : (item.status || 'pendiente');

        const payload = {
          project: item.project,
          tower: item.tower,
          floor: item.floor,
          scope_type: item.scope_type,
          departments: item.departments,
          activity: item.activity,
          start_date: item.start_date,
          end_date: item.end_date,
          planned_qty: item.planned_qty,
          unit: item.unit,
          crew_name: item.crew_name,
          crew_size: item.crew_size,
          crew_members: crewMembers,
          restrictions: '',
          observations: newObservations,
          status: newStatus,
          release_status: 'liberado',
        };

        await api.put(`/master-items/${item.id}`, payload);
      } else if (resolvingRestriction.type === 'reporte_diario') {
        const log = resolvingRestriction.rawLog;
        const newObservations = log.observations
          ? `${log.observations}\n${noteAppend}`
          : noteAppend;

        const payload = {
          date: log.date,
          executed_today: log.executed_today,
          supervisor: log.supervisor,
          crew_name: log.crew_name,
          crew_workers: log.crew_workers,
          hours_worked: log.hours_worked,
          has_restriction: false,
          restriction_detail: log.restriction_detail,
          observations: newObservations,
          capataz_name: log.capataz_name || 'Capataz',
          capataz_signature: log.capataz_signature,
          floor: log.floor,
          is_zero_progress: 0,
        };

        await api.put(`/daily-logs/${log.id}`, payload);
      }

      await queryClient.invalidateQueries({ queryKey: ['masterItems'] });
      await queryClient.invalidateQueries({ queryKey: ['dailyLogs'] });

      toast({
        title: 'Restricción levantada',
        description: 'Se ha registrado la resolución con éxito.',
      });

      setResolvingRestriction(null);
      setResolutionNote('');
    } catch (err) {
      console.error('Error resolving restriction:', err);
      toast({
        title: 'Error al liberar restricción',
        description: err.message || 'No se pudo actualizar el registro',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  // Create new restriction on a master item
  const handleCreateRestriction = async (e) => {
    e.preventDefault();
    if (!newMasterItemId || !newDetail.trim()) {
      toast({
        title: 'Campos requeridos',
        description: 'Debes seleccionar una actividad e ingresar el detalle de la restricción.',
        variant: 'destructive',
      });
      return;
    }

    const item = masterItems.find((i) => String(i.id) === String(newMasterItemId));
    if (!item) return;

    setIsSubmittingNew(true);
    try {
      let crewMembers = item.crew_members;
      if (typeof crewMembers === 'string') {
        try {
          crewMembers = JSON.parse(crewMembers);
        } catch {
          crewMembers = [];
        }
      }

      const newStatus = newSeverity === 'crítica' ? 'bloqueado' : item.status;

      const payload = {
        project: item.project,
        tower: item.tower,
        floor: item.floor,
        scope_type: item.scope_type,
        departments: item.departments,
        activity: item.activity,
        start_date: item.start_date,
        end_date: item.end_date,
        planned_qty: item.planned_qty,
        unit: item.unit,
        crew_name: item.crew_name,
        crew_size: item.crew_size,
        crew_members: crewMembers,
        restrictions: newDetail.trim(),
        observations: item.observations || '',
        status: newStatus,
        release_status: 'no_liberado',
      };

      await api.put(`/master-items/${item.id}`, payload);
      await queryClient.invalidateQueries({ queryKey: ['masterItems'] });

      toast({
        title: 'Restricción registrada',
        description: 'La restricción ha sido asociada al ítem correspondiente.',
      });

      setIsNewModalOpen(false);
      setNewDetail('');
      setNewMasterItemId('');
      setNewSeverity('normal');
    } catch (err) {
      console.error('Error creating restriction:', err);
      toast({
        title: 'Error al registrar',
        description: err.message || 'No se pudo registrar la restricción',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (itemsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  // Items selectable for new restriction
  const availableItemsForNew = masterItems
    .filter((i) => !newProject || i.project === newProject)
    .filter((i) => i.status !== 'completado')
    .slice(0, 80);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2 text-slate-900">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            Centro de Restricciones
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gestión de bloqueos, interferencias y respaldo contractual de faena
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs text-slate-700 print:hidden"
            onClick={handlePrint}
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir Matriz
          </Button>

          <Button
            size="sm"
            className="h-9 gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white font-semibold print:hidden shadow-xs"
            onClick={() => {
              setNewProject(selectedProject && selectedProject !== 'all' ? selectedProject : (filteredProjects[0]?.name || ''));
              setIsNewModalOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Registrar Restricción
          </Button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        {/* Activas */}
        <Card
          className={`border shadow-xs cursor-pointer transition-all ${
            activeTab === 'activas' ? 'ring-2 ring-slate-800 bg-slate-50/50' : 'hover:bg-slate-50/30'
          }`}
          onClick={() => {
            setActiveTab('activas');
            setSelectedSeverity('all');
          }}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  Activas Totales
                </p>
                <p className="text-2xl font-bold mt-1 text-slate-900">{stats.total}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                <Clock className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Críticas */}
        <Card
          className={`border border-l-4 border-l-red-500 shadow-xs cursor-pointer transition-all ${
            selectedSeverity === 'crítica' && activeTab === 'activas' ? 'ring-2 ring-red-500 bg-red-50/40' : 'hover:bg-red-50/20'
          }`}
          onClick={() => {
            setActiveTab('activas');
            setSelectedSeverity('crítica');
          }}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-red-600 uppercase tracking-wide">
                  Críticas (Detenido)
                </p>
                <p className="text-2xl font-bold text-red-600 mt-1">{stats.criticas}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center text-red-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Normales */}
        <Card
          className={`border border-l-4 border-l-amber-500 shadow-xs cursor-pointer transition-all ${
            selectedSeverity === 'normal' && activeTab === 'activas' ? 'ring-2 ring-amber-500 bg-amber-50/40' : 'hover:bg-amber-50/20'
          }`}
          onClick={() => {
            setActiveTab('activas');
            setSelectedSeverity('normal');
          }}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-amber-700 uppercase tracking-wide">
                  Normales (Aviso)
                </p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{stats.normales}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                <AlertCircle className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resueltas */}
        <Card
          className={`border border-l-4 border-l-emerald-500 shadow-xs cursor-pointer transition-all ${
            activeTab === 'resueltas' ? 'ring-2 ring-emerald-500 bg-emerald-50/40' : 'hover:bg-emerald-50/20'
          }`}
          onClick={() => {
            setActiveTab('resueltas');
            setSelectedSeverity('all');
          }}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-emerald-700 uppercase tracking-wide">
                  Resueltas / Historial
                </p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.resueltas}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Control Tabs & Filters Bar */}
      <div className="space-y-3 print:hidden">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b pb-2 flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('activas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'activas'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              🚨 Activas ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('resueltas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'resueltas'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              ✓ Resueltas ({stats.resueltas})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('todas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'todas'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Todas ({stats.total + stats.resueltas})
            </button>
          </div>

          {/* Quick Search */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar por frente, causa o ITO..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-white rounded-lg border-slate-200"
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterPill
            label="Obra"
            value={selectedProject || 'all'}
            options={filteredProjects.map((p) => p.name)}
            onChange={(val) => setSelectedProject(val === 'all' ? '' : val)}
          />

          <FilterPill
            label="Severidad"
            value={selectedSeverity}
            placeholder="Todas"
            options={[
              { value: 'all', label: 'Todas las severidades' },
              { value: 'crítica', label: '🚨 Solo Críticas' },
              { value: 'normal', label: '⚠️ Solo Normales' },
            ]}
            onChange={setSelectedSeverity}
          />

          <FilterPill
            label="Categoría"
            value={selectedCategory}
            placeholder="Todas"
            options={[
              { value: 'all', label: 'Todas las categorías' },
              ...RESTRICTION_CATEGORIES.map((c) => ({
                value: c.id,
                label: `${c.icon} ${c.name}`,
              })),
            ]}
            onChange={setSelectedCategory}
          />

          <FilterPill
            label="Origen"
            value={selectedSource}
            placeholder="Todos"
            options={[
              { value: 'all', label: 'Todos los orígenes' },
              { value: 'item_maestro', label: '📋 Ítem Maestro' },
              { value: 'reporte_diario', label: '📝 Reporte Diario' },
            ]}
            onChange={setSelectedSource}
          />

          {uniqueActivities.length > 0 && (
            <FilterPill
              label="Actividad"
              value={selectedActivity}
              options={uniqueActivities}
              onChange={setSelectedActivity}
            />
          )}

          {(selectedSeverity !== 'all' || selectedCategory !== 'all' || selectedSource !== 'all' || selectedActivity !== 'all' || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[11px] text-muted-foreground hover:text-slate-900"
              onClick={() => {
                setSelectedSeverity('all');
                setSelectedCategory('all');
                setSelectedSource('all');
                setSelectedActivity('all');
                setSearchQuery('');
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Main List / Table */}
      <Card className="border shadow-xs">
        <CardHeader className="pb-3 border-b bg-slate-50/40">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <span>
                {activeTab === 'activas' && 'Restricciones Activas en Terreno'}
                {activeTab === 'resueltas' && 'Historial de Restricciones Resueltas'}
                {activeTab === 'todas' && 'Matriz Integral de Restricciones'}
              </span>
              {selectedProject && selectedProject !== 'all' && (
                <span className="text-muted-foreground font-normal">
                  — Obra: {selectedProject}
                </span>
              )}
            </CardTitle>
            <Badge variant="outline" className="text-xs font-mono">
              {filteredRestrictions.length} {filteredRestrictions.length === 1 ? 'registro' : 'registros'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {filteredRestrictions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2 stroke-[1.5]" />
              <p className="text-sm font-semibold text-slate-800">
                {activeTab === 'activas'
                  ? 'No hay restricciones activas pendientes'
                  : 'No se encontraron restricciones con los filtros actuales'}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                {activeTab === 'activas'
                  ? 'Todos los frentes se encuentran operando con normalidad o sin bloqueos reportados.'
                  : 'Prueba cambiando los filtros de búsqueda o cambiando de pestaña.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRestrictions.map((restriction) => {
                const cleanLocation = formatRestrictionLocation(restriction, masterItems);
                const isCrit = restriction.severity === 'crítica';
                const isResolved = restriction.isResolved;

                return (
                  <div
                    key={`${restriction.type}-${restriction.id}`}
                    className={`border rounded-lg p-4 transition-all ${
                      isResolved
                        ? 'bg-slate-50/60 border-slate-200 opacity-90'
                        : isCrit
                        ? 'bg-red-50/40 border-red-200'
                        : 'bg-amber-50/30 border-amber-200'
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      {/* Left Block: Icon & Main Content */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Icon */}
                        <div className="mt-0.5 shrink-0">
                          {isResolved ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          ) : isCrit ? (
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-amber-600" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Top Badges & Activity Title */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900 leading-snug">
                              {restriction.activity}
                            </span>

                            {/* Severity Badge */}
                            <Badge
                              className={`text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 border ${
                                isResolved
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : isCrit
                                  ? 'bg-red-100 text-red-800 border-red-300'
                                  : 'bg-amber-100 text-amber-800 border-amber-300'
                              }`}
                            >
                              {isResolved ? '✓ RESUELTA' : isCrit ? '🚨 CRÍTICA' : '⚠️ NORMAL'}
                            </Badge>

                            {/* Category Badge */}
                            {restriction.category && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-medium border px-2 py-0.5 ${restriction.category.badgeClass}`}
                              >
                                {restriction.category.icon} {restriction.category.name}
                              </Badge>
                            )}

                            {/* Source Badge */}
                            <Badge
                              variant="outline"
                              className="text-[10px] font-medium bg-white text-slate-600 border-slate-200"
                            >
                              {restriction.type === 'item_maestro' ? '📋 Ítem Maestro' : '📝 Reporte Diario'}
                            </Badge>

                            {/* Date Badge */}
                            <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1 font-mono">
                              <Calendar className="w-3 h-3" />
                              {formatRestrictionDate(restriction.date)}
                            </span>
                          </div>

                          {/* Location & Context */}
                          <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
                            <span className="font-semibold text-slate-900">{restriction.project}</span>
                            <span>•</span>
                            <span className="font-medium bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-800">
                              {cleanLocation}
                            </span>
                            {restriction.crewName && (
                              <>
                                <span>•</span>
                                <span className="text-slate-600">
                                  Cuadrilla: <strong className="text-slate-800">{restriction.crewName}</strong>
                                </span>
                              </>
                            )}
                            {restriction.supervisor && (
                              <span className="text-muted-foreground">
                                (Supervisor: {restriction.supervisor})
                              </span>
                            )}
                          </div>

                          {/* Restriction Detail Box */}
                          <div className="rounded-md border border-slate-200/80 bg-white/80 p-3 shadow-2xs">
                            <p className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                              <span>🛡️ Respaldo Contractual / Motivo:</span>
                            </p>
                            <p className="text-xs text-slate-900 leading-relaxed font-normal whitespace-pre-line">
                              {restriction.description}
                            </p>
                          </div>

                          {/* Observations / Resolution log if any */}
                          {restriction.observations && (
                            <div className="text-[11px] text-slate-600 bg-slate-100/60 p-2 rounded border border-slate-200/50">
                              <span className="font-semibold text-slate-700">Bitácora / Observación: </span>
                              <span className="whitespace-pre-line">{restriction.observations}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Block: Actions */}
                      <div className="flex sm:flex-row lg:flex-col items-center lg:items-end gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-200 print:hidden">
                        {!isResolved && (
                          <Button
                            size="sm"
                            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium w-full sm:w-auto shadow-2xs"
                            onClick={() => {
                              setResolvingRestriction(restriction);
                              setResolutionNote('');
                            }}
                          >
                            <Check className="w-3.5 h-3.5" />
                            Liberar Restricción
                          </Button>
                        )}

                        {restriction.relatedId && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1.5 text-slate-700 hover:text-slate-900 bg-white w-full sm:w-auto"
                            onClick={() =>
                              navigate(`/item/${restriction.relatedId}`, {
                                state: { from: '/restrictions' },
                              })
                            }
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            Ir al Ítem
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: Liberar Restricción */}
      <Dialog
        open={Boolean(resolvingRestriction)}
        onOpenChange={(open) => {
          if (!open) {
            setResolvingRestriction(null);
            setResolutionNote('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Liberar / Resolver Restricción
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Registra el levantamiento de esta interferencia para habilitar la continuidad operacional del frente.
            </DialogDescription>
          </DialogHeader>

          {resolvingRestriction && (
            <div className="space-y-3 py-2 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1">
                <p className="font-bold text-slate-900">
                  {resolvingRestriction.activity}
                </p>
                <p className="text-muted-foreground">
                  {resolvingRestriction.project} • {formatRestrictionLocation(resolvingRestriction, masterItems)}
                </p>
                <p className="text-slate-700 italic border-t pt-1 mt-1 text-[11px]">
                  "{resolvingRestriction.description}"
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">
                  Comentario / Solución de Levantamiento (opcional):
                </label>
                <Textarea
                  placeholder="Ej: Frente civil entregado por constructora, material recepcionado en bodega, resolución aprobada por ITO..."
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  className="text-xs min-h-[70px]"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setResolvingRestriction(null)}
              disabled={isSubmittingResolution}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              onClick={handleConfirmResolution}
              disabled={isSubmittingResolution}
            >
              {isSubmittingResolution ? 'Guardando...' : '✓ Confirmar Levantamiento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Registrar Nueva Restricción */}
      <Dialog open={isNewModalOpen} onOpenChange={setIsNewModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Registrar Restricción en Ítem
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Asocia un bloqueo o interferencia a un frente de trabajo para alertar al equipo y registrar respaldo contractual.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateRestriction} className="space-y-3.5 py-1 text-xs">
            {/* Obra */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-800">Obra / Proyecto *</label>
              <select
                className="w-full h-8 px-2 rounded-md border border-slate-200 bg-white text-xs"
                value={newProject}
                onChange={(e) => {
                  setNewProject(e.target.value);
                  setNewMasterItemId('');
                }}
                required
              >
                <option value="">Selecciona una obra...</option>
                {filteredProjects.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Actividad / Frente */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-800">Frente / Actividad Afectada *</label>
              <select
                className="w-full h-8 px-2 rounded-md border border-slate-200 bg-white text-xs"
                value={newMasterItemId}
                onChange={(e) => setNewMasterItemId(e.target.value)}
                required
                disabled={!newProject}
              >
                <option value="">
                  {newProject ? 'Selecciona la actividad...' : 'Primero selecciona una obra'}
                </option>
                {availableItemsForNew.map((item) => {
                  const loc = formatRestrictionLocation({ type: 'item_maestro', id: item.id, rawItem: item }, masterItems);
                  return (
                    <option key={item.id} value={item.id}>
                      {loc} — {item.activity}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Causas Rápidas */}
            <div className="space-y-1 rounded-lg border border-rose-200/60 bg-rose-50/50 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-900 flex items-center gap-1">
                  🛡️ Causas Frecuentes de Respaldo
                </span>
                <span className="text-[10px] text-rose-600">
                  Toca para autocompletar
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {QUICK_RESTRICTIONS.map((cause) => (
                  <button
                    key={cause}
                    type="button"
                    onClick={() => {
                      if (!newDetail.trim()) {
                        setNewDetail(cause);
                      } else if (!newDetail.includes(cause)) {
                        setNewDetail(`${newDetail.trim()}; ${cause}`);
                      }
                    }}
                    className="inline-flex items-center rounded-md border border-rose-300 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-800 shadow-2xs hover:bg-rose-100 transition-colors cursor-pointer"
                  >
                    + {cause}
                  </button>
                ))}
              </div>
            </div>

            {/* Detalle */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-800">
                Detalle de la Restricción *
              </label>
              <Textarea
                placeholder="Describe la causa, la especialidad que interfiere, ubicación específica o documento RDI pendiente..."
                value={newDetail}
                onChange={(e) => setNewDetail(e.target.value)}
                className="text-xs min-h-[60px]"
                required
              />
            </div>

            {/* Severidad */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-800">Nivel de Impacto Operativo</label>
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setNewSeverity('normal')}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                    newSeverity === 'normal'
                      ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-400 text-amber-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <p className="font-bold text-[11px] flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    Normal (Aviso)
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Interferencia parcial sin detención total del frente.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setNewSeverity('crítica')}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                    newSeverity === 'crítica'
                      ? 'border-red-400 bg-red-50 ring-1 ring-red-400 text-red-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <p className="font-bold text-[11px] flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    Crítica (Bloqueo)
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Frente detenido por completo. Pasa a estado "Bloqueado".
                  </p>
                </button>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsNewModalOpen(false)}
                disabled={isSubmittingNew}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white font-semibold"
                disabled={isSubmittingNew}
              >
                {isSubmittingNew ? 'Registrando...' : 'Registrar Restricción'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
