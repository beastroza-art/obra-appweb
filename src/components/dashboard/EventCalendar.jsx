import React, { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Flag,
  MapPin,
  Target,
  Users,
  X,
} from 'lucide-react';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function parseLocalDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

function getEventIcon(type) {
  if (type === 'start') return <Flag className="h-3 w-3 shrink-0" />;
  if (type === 'end') return <Target className="h-3 w-3 shrink-0" />;
  return <ClipboardList className="h-3 w-3 shrink-0" />;
}

function EventDetailCard({ event, onClose, showClose = true, className }) {
  if (!event) return null;

  const detail = event.detail || {};
  const isActivity = event.type === 'start' || event.type === 'end';

  return (
    <div className={cn('rounded-lg border bg-card p-3 shadow-sm', className)}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-1.5">
            <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded text-white', event.color)}>
              {getEventIcon(event.type)}
            </span>
            <p className="truncate text-sm font-semibold">{detail.title || event.label}</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {event.type === 'start' ? 'Inicio de actividad' : event.type === 'end' ? 'Termino de actividad' : 'Reporte diario'}
          </p>
        </div>

        {showClose && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-2">
        {detail.project && (
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Proyecto</p>
            <p className="font-medium">{detail.project}</p>
          </div>
        )}

        {(detail.tower || detail.floor) && (
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Ubicacion</p>
            <p className="flex items-center gap-1 font-medium">
              <MapPin className="h-3 w-3" />
              {[detail.tower, detail.floor].filter(Boolean).join(' / ')}
            </p>
          </div>
        )}

        {detail.crew && (
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Cuadrilla</p>
            <p className="flex items-center gap-1 font-medium">
              <Users className="h-3 w-3" />
              {detail.crew}
            </p>
          </div>
        )}

        {detail.supervisor && (
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Supervisor</p>
            <p className="font-medium">{detail.supervisor}</p>
          </div>
        )}

        {detail.planned != null && (
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Planificado</p>
            <p className="font-medium">
              {detail.planned} {detail.unit || ''}
            </p>
          </div>
        )}

        {detail.executed != null && (
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Ejecutado</p>
            <p className="flex items-center gap-1 font-medium">
              <CheckCircle2 className="h-3 w-3" />
              {detail.executed}
            </p>
          </div>
        )}

        {detail.hours != null && detail.hours !== '' && (
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Horas</p>
            <p className="flex items-center gap-1 font-medium">
              <Clock className="h-3 w-3" />
              {detail.hours}h
            </p>
          </div>
        )}

        {isActivity && (detail.start || detail.end) && (
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[10px] uppercase text-muted-foreground">{event.type === 'start' ? 'Termino' : 'Inicio'}</p>
            <p className="font-medium">{event.type === 'start' ? detail.end : detail.start}</p>
          </div>
        )}
      </div>

      {detail.restriction && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-red-50 p-2 text-xs font-medium text-red-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          Con restriccion
        </div>
      )}

      {detail.obs && (
        <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs">
          <p className="mb-1 text-[10px] uppercase text-muted-foreground">Observacion</p>
          <p className="text-muted-foreground">{detail.obs}</p>
        </div>
      )}
    </div>
  );
}

function DayEventsPanel({ selectedDay, selectedEvent, onSelectEvent, onClose }) {
  if (!selectedDay) return null;

  const activeEvent = selectedEvent || selectedDay.events[0];

  return (
    <div className="absolute left-1 right-1 top-1 z-20 max-h-[calc(100%-0.5rem)] overflow-y-auto rounded-lg border bg-background p-3 shadow-xl sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3 border-b pb-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            Eventos del {format(selectedDay.date, 'd MMM yyyy', { locale: es })}
          </p>
          <p className="text-xs text-muted-foreground">{selectedDay.events.length} eventos programados</p>
        </div>

        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(240px,0.85fr)_minmax(300px,1.15fr)]">
        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Listado</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {selectedDay.events.length}
            </span>
          </div>

          <div className="max-h-[340px] space-y-1 overflow-y-auto pr-1">
            {selectedDay.events.map((event) => (
              <button
                key={event.id}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition hover:bg-muted',
                  selectedEvent?.id === event.id && 'border-accent bg-accent/10'
                )}
                onClick={() => onSelectEvent(event)}
              >
                <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded text-white', event.color)}>
                  {getEventIcon(event.type)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{event.label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {[event.detail?.tower, event.detail?.floor, event.detail?.crew || event.detail?.supervisor]
                      .filter(Boolean)
                      .join(' / ')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <EventDetailCard event={activeEvent} onClose={onClose} showClose={false} className="h-fit" />
      </div>
    </div>
  );
}

export default function EventCalendar({ masterItems = [], dailyLogs = [] }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const masterItemIds = useMemo(
    () => new Set(masterItems.map((item) => item.id)),
    [masterItems]
  );

  const yearOptions = useMemo(() => {
    const years = [new Date().getFullYear()];
    [...masterItems, ...dailyLogs].forEach((item) => {
      const raw = item?.date || item?.start_date || item?.end_date;
      if (!raw) return;
      const parsed = parseLocalDate(raw);
      if (!Number.isNaN(parsed.getTime())) years.push(parsed.getFullYear());
    });

    const minYear = Math.min(...years) - 12;
    const maxYear = Math.max(...years) + 12;
    const range = [];
    for (let year = maxYear; year >= minYear; year -= 1) range.push(year);
    return range;
  }, [dailyLogs, masterItems]);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, idx) => ({
        value: idx,
        label: format(new Date(2024, idx, 1), 'MMM', { locale: es }),
      })),
    []
  );

  const getEventsForDay = (day) => {
    const events = [];

    masterItems.forEach((item, itemIndex) => {
      if (item.start_date && isSameDay(parseLocalDate(item.start_date), day)) {
        events.push({
          id: `start-${item.id || itemIndex}`,
          type: 'start',
          label: item.activity,
          color: 'bg-blue-500',
          detail: {
            title: item.activity,
            project: item.project,
            tower: item.tower,
            floor: item.floor,
            crew: item.crew_name,
            end: item.end_date,
            planned: item.planned_qty,
            unit: item.unit,
          },
        });
      }
      if (item.end_date && isSameDay(parseLocalDate(item.end_date), day)) {
        events.push({
          id: `end-${item.id || itemIndex}`,
          type: 'end',
          label: item.activity,
          color: 'bg-red-500',
          detail: {
            title: item.activity,
            project: item.project,
            tower: item.tower,
            floor: item.floor,
            crew: item.crew_name,
            start: item.start_date,
            planned: item.planned_qty,
            unit: item.unit,
          },
        });
      }
    });

    dailyLogs
      .filter((log) => !log.master_item_id || masterItemIds.has(log.master_item_id))
      .forEach((log, logIndex) => {
        if (log.date && isSameDay(parseLocalDate(log.date), day)) {
          events.push({
            id: `log-${log.id || logIndex}`,
            type: 'log',
            label: log.activity || 'Reporte',
            color: 'bg-emerald-500',
            detail: {
              title: log.activity || 'Reporte Diario',
              project: log.project,
              tower: log.tower,
              floor: log.floor,
              supervisor: log.supervisor,
              executed: log.executed_today,
              hours: log.hours_worked,
              restriction: log.has_restriction,
              obs: log.observations,
            },
          });
        }
      });

    return events;
  };

  const openDayEvents = (day, events) => {
    setSelectedDay({ date: day, events });
    setSelectedEvent(events[0] || null);
  };

  const openEvent = (day, events, event) => {
    setSelectedDay({ date: day, events });
    setSelectedEvent(event);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Calendar className="h-4 w-4 text-accent" />
            Calendario de Eventos
          </CardTitle>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 min-w-[132px] px-2 text-xs sm:text-sm font-medium capitalize"
                >
                  {format(currentMonth, 'MMMM yyyy', { locale: es })}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(92vw,320px)] p-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-center">
                    <Select
                      value={String(currentMonth.getFullYear())}
                      onValueChange={(value) =>
                        setCurrentMonth(new Date(Number(value), currentMonth.getMonth(), 1))
                      }
                    >
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue placeholder="Año" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {yearOptions.map((year) => (
                          <SelectItem key={year} value={String(year)}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {monthOptions.map((month) => (
                      <Button
                        key={month.value}
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'h-8 text-xs uppercase',
                          currentMonth.getMonth() === month.value && 'bg-muted font-semibold'
                        )}
                        onClick={() => {
                          setCurrentMonth(new Date(currentMonth.getFullYear(), month.value, 1));
                          setMonthPickerOpen(false);
                        }}
                      >
                        {month.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="relative">
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="grid min-w-[620px] grid-cols-7 gap-px overflow-hidden rounded-lg bg-border">
              {dayNames.map((dayName) => (
                <div
                  key={dayName}
                  className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground"
                >
                  {dayName}
                </div>
              ))}

              {Array.from({ length: startDayOfWeek }).map((_, index) => (
                <div key={`empty-${index}`} className="min-h-[82px] sm:min-h-[100px] bg-card p-1.5 sm:p-2" />
              ))}

              {days.map((day) => {
                const events = getEventsForDay(day);
                const isToday = isSameDay(day, new Date());

                return (
              <div
                key={day.toISOString()}
                className={`min-h-[82px] sm:min-h-[100px] bg-card p-1 sm:p-1.5 ${
                  isToday ? 'ring-2 ring-accent ring-inset' : ''
                }`}
              >
                <span
                  className={`text-xs font-medium ${isToday ? 'font-bold text-accent' : 'text-muted-foreground'}`}
                >
                  {format(day, 'd')}
                </span>

                <div className="mt-1 space-y-0.5">
                  {events.slice(0, 4).map((event, index) => (
                    <button
                      key={`${event.type}-${event.label}-${index}`}
                      type="button"
                      className={`${event.color} flex w-full cursor-pointer items-center gap-0.5 truncate rounded px-1 py-0.5 text-left text-[8px] leading-tight text-white sm:text-[9px]`}
                      onClick={() => openEvent(day, events, event)}
                    >
                      {getEventIcon(event.type)}
                      <span className="truncate">{event.label}</span>
                    </button>
                  ))}

                  {events.length > 4 && (
                    <button
                      type="button"
                      className="w-full cursor-pointer rounded px-1 py-0.5 text-left text-[9px] font-medium text-accent hover:bg-accent/10"
                      onClick={() => openDayEvents(day, events)}
                    >
                      Ver todos
                    </button>
                  )}
                </div>
              </div>
                );
              })}
            </div>
          </div>

          <DayEventsPanel
            selectedDay={selectedDay}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            onClose={() => {
              setSelectedDay(null);
              setSelectedEvent(null);
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
            <span className="text-xs text-muted-foreground">Inicio actividad</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-red-500" />
            <span className="text-xs text-muted-foreground">Término actividad</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            <span className="text-xs text-muted-foreground">Reporte diario</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
