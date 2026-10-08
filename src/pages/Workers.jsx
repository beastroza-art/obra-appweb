import React, { useState, useRef, useMemo } from 'react';
import FilterPill from '@/components/common/FilterPill';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users,
  Plus,
  Trash2,
  FileSpreadsheet,
  Upload,
  AlertCircle,
  Pencil,
  CalendarDays,
  Download,
  FileText,
  ChevronDown,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/lib/PermissionsContext';
import { useProjectFilter } from '@/lib/ProjectFilterContext';
import { api } from '@/lib/api';
import {
  exportWorkersWithoutActivityPDF,
  exportWorkersWithoutActivityExcel,
} from '@/utils/exportWorkersReports';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value + 'T00:00:00');
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function Workers() {
  const queryClient = useQueryClient();
  const { hasAccessToProject, userRole, canDelete, canManagePersonal } = usePermissions();
  const { selectedProject, setSelectedProject } = useProjectFilter();
  const fileInputRef = useRef(null);

  const [showForm, setShowForm] = useState(false);
  const [selectedRole, setSelectedRole] = useState('all');
  const [selectedActivity, setSelectedActivity] = useState('all');
  const [filterActivityStatus, setFilterActivityStatus] = useState('all');
  const [form, setForm] = useState({ project: '', name: '', role: '', transfer_date: '' });
  const [formError, setFormError] = useState('');

  const [showEditForm, setShowEditForm] = useState(false);
  const [editWorker, setEditWorker] = useState(null);
  const [editForm, setEditForm] = useState({ project: '', name: '', role: '', transfer_date: '' });
  const [editError, setEditError] = useState('');

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importProject, setImportProject] = useState('');

  const { data: projectWorkers = [], isLoading } = useQuery({
    queryKey: ['projectWorkers'],
    queryFn: () => api.get('/project-workers'),
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

  const createWorker = useMutation({
    mutationFn: (data) => api.post('/project-workers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectWorkers'] });
      setShowForm(false);
      setForm({ project: '', name: '', role: '', transfer_date: '' });
      setFormError('');
    },
    onError: (err) => setFormError(err.message || 'Error al guardar.'),
  });

  const updateWorker = useMutation({
    mutationFn: ({ id, data }) => api.put(`/project-workers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectWorkers'] });
      setShowEditForm(false);
      setEditWorker(null);
      setEditError('');
    },
    onError: (err) => setEditError(err.message || 'Error al actualizar.'),
  });

  const deleteWorker = useMutation({
    mutationFn: (id) => api.delete(`/project-workers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projectWorkers'] }),
  });

  const canSeeWorker = (w) => userRole === 'admin' || hasAccessToProject(w.project);

  const projectWorkersList = useMemo(() => {
    return projectWorkers.filter(canSeeWorker).filter((w) => {
      if (selectedProject && selectedProject !== 'all' && w.project !== selectedProject) return false;
      return true;
    });
  }, [projectWorkers, selectedProject, userRole, hasAccessToProject]);

  const workerRoles = useMemo(() => {
    return [...new Set(projectWorkersList.map((w) => w.role).filter(Boolean))];
  }, [projectWorkersList]);

  const uniqueActivities = useMemo(() => {
    const projectLogs = dailyLogs.filter(log => {
      const matchesAccess = userRole === 'admin' || hasAccessToProject(log.project);
      if (!matchesAccess) return false;
      if (selectedProject && selectedProject !== 'all' && log.project !== selectedProject) return false;
      return true;
    });
    return [...new Set(projectLogs.map(l => l.activity).filter(Boolean))];
  }, [dailyLogs, selectedProject, userRole, hasAccessToProject]);

  const workersWithActivity = useMemo(() => {
    if (selectedActivity === 'all') return null;
    const names = new Set();
    dailyLogs.forEach(log => {
      if (log.activity === selectedActivity) {
        log.crew_workers?.forEach(w => {
          if (w.name) names.add(w.name.trim().toLowerCase());
        });
      }
    });
    return names;
  }, [dailyLogs, selectedActivity]);

  const workersWithoutActivity = useMemo(() => {
    return projectWorkersList.filter(
      (w) => !w.current_activity || !String(w.current_activity).trim() || String(w.current_activity).trim() === '—'
    );
  }, [projectWorkersList]);

  const filteredWorkers = useMemo(() => {
    return projectWorkersList.filter((w) => {
      if (selectedRole !== 'all' && w.role !== selectedRole) return false;
      if (selectedActivity !== 'all' && workersWithActivity) {
        if (!workersWithActivity.has(w.name?.trim().toLowerCase())) return false;
      }
      if (filterActivityStatus === 'sin_actividad') {
        const hasAct = w.current_activity && String(w.current_activity).trim() && String(w.current_activity).trim() !== '—';
        if (hasAct) return false;
      }
      if (filterActivityStatus === 'con_actividad') {
        const hasAct = w.current_activity && String(w.current_activity).trim() && String(w.current_activity).trim() !== '—';
        if (!hasAct) return false;
      }
      return true;
    });
  }, [projectWorkersList, selectedRole, selectedActivity, workersWithActivity, filterActivityStatus]);

  const allProjects = filteredProjects.map((p) => p.name);

  const allFilteredIds = filteredWorkers.map((w) => w.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));
  const someSelected = allFilteredIds.some((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allFilteredIds));
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      for (const id of selectedIds) {
        await api.delete(`/project-workers/${id}`);
      }
      queryClient.invalidateQueries({ queryKey: ['projectWorkers'] });
      setSelectedIds(new Set());
      setShowBulkConfirm(false);
    } catch (err) {
      console.error('Error al eliminar:', err);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleOpenEdit = (w) => {
    setEditWorker(w);
    setEditForm({ project: w.project, name: w.name, role: w.role || '', transfer_date: w.transfer_date || '' });
    setEditError('');
    setShowEditForm(true);
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        const parsed = rows
          .map((row) => ({
            name: String(row['Nombre'] || row['nombre'] || row['name'] || row['NOMBRE'] || '').trim(),
            role: String(row['Cargo'] || row['cargo'] || row['role'] || row['CARGO'] || '').trim(),
          }))
          .filter((r) => r.name);

        if (parsed.length === 0) {
          setImportError('No se encontraron filas válidas. Asegúrate de que el archivo tenga columnas "Nombre" y "Cargo".');
          setImportRows([]);
        } else {
          setImportError('');
          setImportRows(parsed);
        }
        setImportProject(selectedProject !== 'all' ? selectedProject : '');
        setShowImportPreview(true);
      } catch (err) {
        setImportError('Error al leer el archivo: ' + err.message);
        setImportRows([]);
        setImportProject('');
        setShowImportPreview(true);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    setImporting(true);
    setImportError('');
    const skipped = [];
    try {
      for (const row of importRows) {
        try {
          await api.post('/project-workers', {
            project: importProject,
            name: row.name,
            role: row.role,
            active: true,
          });
        } catch (err) {
          skipped.push(row.name);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['projectWorkers'] });
      setShowImportPreview(false);
      setImportRows([]);
      setImportProject('');
      if (skipped.length > 0) {
        alert(`Importación completada.\nSe omitieron ${skipped.length} persona(s) por nombre duplicado:\n${skipped.join(', ')}`);
      }
    } catch (err) {
      setImportError('Error al importar: ' + (err.message || 'Error desconocido'));
    } finally {
      setImporting(false);
    }
  };

  const handleCloseImport = () => {
    setShowImportPreview(false);
    setImportRows([]);
    setImportError('');
    setImportProject('');
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const emptyStateColSpan = 5 + (canDelete ? 1 : 0) + ((canManagePersonal || canDelete) ? 1 : 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Users className="w-5 h-5 text-accent" />
          Personal
        </h1>

        <div className="flex items-center gap-2 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-amber-300 bg-amber-50/70 hover:bg-amber-100 text-amber-900 shadow-sm font-medium"
                title="Descargar reporte de personal disponible sin labor actual asignada"
              >
                <Download className="w-3.5 h-3.5 text-amber-700" />
                <span>Sin Actividad ({workersWithoutActivity.length})</span>
                <ChevronDown className="w-3 h-3 text-amber-600 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem
                onClick={() =>
                  exportWorkersWithoutActivityExcel({
                    workers: workersWithoutActivity,
                    projectName: selectedProject,
                  })
                }
                className="text-xs gap-2.5 cursor-pointer py-2"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <div>
                  <p className="font-semibold text-foreground">Exportar a Excel (.xlsx)</p>
                  <p className="text-[10px] text-muted-foreground">Planilla con {workersWithoutActivity.length} personas</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  exportWorkersWithoutActivityPDF({
                    workers: workersWithoutActivity,
                    projectName: selectedProject,
                  })
                }
                className="text-xs gap-2.5 cursor-pointer py-2"
              >
                <FileText className="w-4 h-4 text-red-600" />
                <div>
                  <p className="font-semibold text-foreground">Exportar a PDF (.pdf)</p>
                  <p className="text-[10px] text-muted-foreground">Documento imprimible para obra</p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {canManagePersonal && (
            <>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleImportClick}>
                <FileSpreadsheet className="w-3 h-3" />
                Importar Excel/CSV
              </Button>

              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />

              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => {
                  setForm({ project: selectedProject && selectedProject !== 'all' ? selectedProject : '', name: '', role: '', transfer_date: '' });
                  setFormError('');
                  setShowForm(true);
                }}
              >
                <Plus className="w-3 h-3" />
                Agregar Persona
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center flex-wrap">
        <FilterPill
          label="Obra"
          value={selectedProject || 'all'}
          options={allProjects}
          onChange={(v) => {
            setSelectedProject(v === 'all' ? '' : v);
            setSelectedRole('all');
            setSelectedActivity('all');
            setFilterActivityStatus('all');
            setSelectedIds(new Set());
          }}
        />

        <FilterPill
          label="Estado Actividad"
          value={filterActivityStatus}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'sin_actividad', label: `⚠️ Sin Actividad (${workersWithoutActivity.length})` },
            { value: 'con_actividad', label: 'Con Actividad Asignada' },
          ]}
          onChange={setFilterActivityStatus}
        />
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Personal registrado{' '}
              {selectedProject !== 'all' ? `— ${selectedProject}` : ''}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({filteredWorkers.length})
              </span>
            </CardTitle>

            {canDelete && selectedIds.size > 0 && (
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs gap-1.5"
                onClick={() => setShowBulkConfirm(true)}
              >
                <Trash2 className="w-3 h-3" />
                Eliminar {selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {canDelete && (
                    <TableHead className="w-8">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Seleccionar todos"
                        className={someSelected && !allSelected ? 'opacity-50' : ''}
                      />
                    </TableHead>
                  )}
                  <TableHead className="text-xs">Nombre completo</TableHead>
                  <TableHead className="text-xs">Cargo</TableHead>
                  <TableHead className="text-xs">Obra</TableHead>
                  <TableHead className="text-xs">Fecha de Traslado</TableHead>
                  <TableHead className="text-xs">Act. actual</TableHead>
                  {(canManagePersonal || canDelete) && <TableHead className="text-xs text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredWorkers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={emptyStateColSpan} className="text-center text-sm text-muted-foreground py-12">
                      Sin personal registrado.
                    </TableCell>
                  </TableRow>
                )}

                {filteredWorkers.map((w) => (
                  <TableRow
                    key={w.id}
                    className={`hover:bg-muted/30 text-xs ${selectedIds.has(w.id) ? 'bg-muted/20' : ''}`}
                  >
                    {canDelete && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(w.id)}
                          onCheckedChange={() => toggleSelect(w.id)}
                          aria-label={`Seleccionar ${w.name}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell>{w.role || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{w.project}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(w.transfer_date)}</TableCell>
                    <TableCell className="max-w-[220px] truncate font-medium">
                      {w.current_activity && w.current_activity.trim() && w.current_activity.trim() !== '—' ? (
                        <span className="text-muted-foreground" title={w.current_activity}>
                          {w.current_activity}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Sin actividad actual
                        </span>
                      )}
                    </TableCell>
                    {(canManagePersonal || canDelete) && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canManagePersonal && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => handleOpenEdit(w)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-400 hover:text-red-600"
                              onClick={() =>
                                window.confirm(`¿Eliminar a ${w.name}?`) &&
                                deleteWorker.mutate(w.id)
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal agregar persona */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Persona al Padrón</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Obra *</Label>
              <Select value={form.project} onValueChange={(v) => setForm({ ...form, project: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar obra" /></SelectTrigger>
                <SelectContent>
                  {allProjects.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Nombre completo *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Juan Pérez González" />
            </div>
            <div>
              <Label className="text-xs">Cargo</Label>
              <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Ej: Electricista" />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                Fecha de Traslado
              </Label>
              <Input
                type="date"
                value={form.transfer_date}
                onChange={(e) => setForm({ ...form, transfer_date: e.target.value })}
              />
            </div>
            {formError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700">{formError}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setFormError(''); }}>Cancelar</Button>
            <Button onClick={() => createWorker.mutate({ ...form, active: true })} disabled={!form.project || !form.name || createWorker.isPending}>
              {createWorker.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal editar persona */}
      <Dialog open={showEditForm} onOpenChange={setShowEditForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Persona</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Obra *</Label>
              <Select value={editForm.project} onValueChange={(v) => setEditForm({ ...editForm, project: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar obra" /></SelectTrigger>
                <SelectContent>
                  {allProjects.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Nombre completo *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Ej: Juan Pérez González" />
            </div>
            <div>
              <Label className="text-xs">Cargo</Label>
              <Input value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} placeholder="Ej: Electricista" />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                Fecha de Traslado
              </Label>
              <Input
                type="date"
                value={editForm.transfer_date}
                onChange={(e) => setEditForm({ ...editForm, transfer_date: e.target.value })}
              />
            </div>
            {editError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700">{editError}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditForm(false); setEditError(''); }}>Cancelar</Button>
            <Button onClick={() => updateWorker.mutate({ id: editWorker.id, data: editForm })} disabled={!editForm.project || !editForm.name || updateWorker.isPending}>
              {updateWorker.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal confirmación eliminación masiva */}
      {canDelete && (
        <Dialog open={showBulkConfirm} onOpenChange={setShowBulkConfirm}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-red-500" />
                Eliminar {selectedIds.size} persona{selectedIds.size > 1 ? 's' : ''}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Esta acción eliminará permanentemente a las {selectedIds.size} personas seleccionadas del padrón. No se puede deshacer.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkConfirm(false)} disabled={bulkDeleting}>Cancelar</Button>
              <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? 'Eliminando...' : `Eliminar ${selectedIds.size}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal previsualización importación */}
      <Dialog open={showImportPreview} onOpenChange={handleCloseImport}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Importar personal
            </DialogTitle>
          </DialogHeader>

          {importError ? (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{importError}</p>
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs">Obra destino *</Label>
                <Select value={importProject} onValueChange={setImportProject}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar obra" /></SelectTrigger>
                  <SelectContent>
                    {allProjects.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <p className="text-sm text-muted-foreground">
                Se importarán <strong>{importRows.length} personas</strong>.
                {importProject && <> Obra destino: <strong>{importProject}</strong>.</>}
                {' '}Si algún nombre ya existe en el padrón, se omitirá automáticamente.
              </p>

              <div className="max-h-64 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Nombre</TableHead>
                      <TableHead className="text-xs">Cargo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importRows.map((row, i) => (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.role || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseImport} disabled={importing}>Cancelar</Button>
            {!importError && (
              <Button onClick={handleConfirmImport} disabled={importing || !importProject}>
                {importing ? 'Importando...' : `Importar ${importRows.length} personas`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}