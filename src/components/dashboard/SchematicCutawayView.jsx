import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function getActivityType(activityName) {
  const name = String(activityName || "").trim().toUpperCase();
  if (name.startsWith("EL")) return "EL";
  if (name.startsWith("TC") || name.startsWith("TL")) return "TC";
  if (name.startsWith("CD")) return "CD";

  if (name.includes("ELECTRICA") || name.includes("ELÉCTRICA") || name.includes("FUERZA")) return "EL";
  if (name.includes("TELECOM") || name.includes("FIBRA") || name.includes("DATOS")) return "TC";
  if (name.includes("CORRIENTES") || name.includes("CCTV") || name.includes("CITOFONIA") || name.includes("CCDD")) return "CD";
  return null;
}

function getActivitySpecialty(item) {
  const scope = String(item?.scope_type || "").toLowerCase();
  if (scope.includes("vertical_el")) return "EL";
  if (scope.includes("vertical_tc")) return "TC";
  if (scope.includes("vertical_cd")) return "CD";
  return getActivityType(item?.activity);
}

function StructuralColumn({ className }) {
  return (
    <div
      className={cn(
        "absolute inset-y-[-10px] w-[6px] -translate-x-1/2 rounded-sm bg-gradient-to-r from-slate-700/40 via-slate-500/55 to-slate-800/50 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)]",
        className
      )}
    />
  );
}

export default function SchematicCutawayView({
  floors = [],
  items = [],
  selectedFloor = null,
  onSelectFloor,
  showEL = true,
  showTC = true,
  showCD = true,
  visualMode = "progress",
  onOpenDetailModal,
  selectedVerticalSpecialty,
  onSelectVerticalSpecialty,
  showHud = true,
}) {
  // Sort floors top to bottom (Azotea at top, Subterráneos at bottom)
  const sortedFloors = useMemo(() => {
    return [...floors];
  }, [floors]);

  // Extract vertical items per specialty
  const verticalItemsEL = useMemo(() => {
    return (items || []).filter((item) => {
      const type = getActivitySpecialty(item);
      return type === "EL" && (String(item.scope_type || "").includes("vertical") || String(item.floor || "").toLowerCase().includes("vertical"));
    });
  }, [items]);

  const verticalItemsTC = useMemo(() => {
    return (items || []).filter((item) => {
      const type = getActivitySpecialty(item);
      return type === "TC" && (String(item.scope_type || "").includes("vertical") || String(item.floor || "").toLowerCase().includes("vertical"));
    });
  }, [items]);

  const verticalItemsCD = useMemo(() => {
    return (items || []).filter((item) => {
      const type = getActivitySpecialty(item);
      return type === "CD" && (String(item.scope_type || "").includes("vertical") || String(item.floor || "").toLowerCase().includes("vertical"));
    });
  }, [items]);

  // Active columns
  const activeEL = showEL;
  const activeTC = showTC;
  const activeCD = showCD;

  // Check restrictions per specialty for Modo Críticos (blocked visual mode)
  const hasELBlocked = useMemo(() => verticalItemsEL.some((i) => {
    if (i.status === "bloqueado") return true;
    const res = String(i.restrictions || "").trim().toLowerCase();
    return res !== "" && res !== "sin restricción" && res !== "sin restriccion";
  }), [verticalItemsEL]);

  const hasTCBlocked = useMemo(() => verticalItemsTC.some((i) => {
    if (i.status === "bloqueado") return true;
    const res = String(i.restrictions || "").trim().toLowerCase();
    return res !== "" && res !== "sin restricción" && res !== "sin restriccion";
  }), [verticalItemsTC]);

  const hasCDBlocked = useMemo(() => verticalItemsCD.some((i) => {
    if (i.status === "bloqueado") return true;
    const res = String(i.restrictions || "").trim().toLowerCase();
    return res !== "" && res !== "sin restricción" && res !== "sin restriccion";
  }), [verticalItemsCD]);

  const isELRed = visualMode === "blocked" && hasELBlocked;
  const isTCRed = visualMode === "blocked" && hasTCBlocked;
  const isCDRed = visualMode === "blocked" && hasCDBlocked;

  return (
    <div className={cn(
      "w-full bg-slate-950 text-white overflow-x-hidden transition-all duration-300",
      "h-auto p-0 min-h-0",
      "lg:h-full lg:min-h-screen lg:p-3 lg:md:p-6 lg:pl-[360px]"
    )}>
      {/* SCHEMATIC CUTAWAY DIAGRAM (SECCIÓN) */}
      <div className="w-full flex flex-col bg-slate-900/90 border border-slate-800 backdrop-blur-md rounded-2xl p-4 md:p-6 shadow-2xl relative overflow-hidden h-auto lg:max-h-[calc(100vh-80px)] overflow-x-hidden">
        
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

        {/* Diagram Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-3 relative z-10 shrink-0">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-orange-400 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              ESQUEMA EN CORTE (SECCIÓN)
            </span>
            <h3 className="text-sm md:text-base font-bold text-white tracking-tight mt-0.5">
              Rutas de Verticales y Shafts Técnicos
            </h3>
            <p className="text-[11px] md:text-xs text-slate-400">
              {onSelectVerticalSpecialty
                ? "Selecciona la columna de la especialidad (EL, TC o CD) para ver el listado de actividades en el panel izquierdo."
                : "Visualización esquemática de subidas y bajadas desde salas técnicas / subterráneo hacia azotea."}
            </p>
          </div>

          {/* Vertical Activities Counter Badges (Top-Right, WITHOUT Percentage) */}
          <div className="flex flex-wrap items-center gap-2">
            {verticalItemsEL.length > 0 && (
              <Badge
                variant="outline"
                onClick={() => onSelectVerticalSpecialty && onSelectVerticalSpecialty("EL")}
                className={cn(
                  "text-xs px-2.5 py-1 font-extrabold flex items-center gap-1.5 shadow-md cursor-pointer transition-all",
                  selectedVerticalSpecialty === "EL"
                    ? "border-emerald-500 bg-emerald-500/30 text-white animate-pulse"
                    : isELRed
                    ? "border-red-500/40 bg-red-500/20 text-red-400 hover:bg-slate-850"
                    : "border-emerald-500/40 bg-emerald-500/15 text-emerald-450 hover:bg-slate-850"
                )}
              >
                EL: {verticalItemsEL.length} act.
              </Badge>
            )}

            {verticalItemsTC.length > 0 && (
              <Badge
                variant="outline"
                onClick={() => onSelectVerticalSpecialty && onSelectVerticalSpecialty("TC")}
                className={cn(
                  "text-xs px-2.5 py-1 font-extrabold flex items-center gap-1.5 shadow-md cursor-pointer transition-all",
                  selectedVerticalSpecialty === "TC"
                    ? "border-blue-500 bg-blue-500/30 text-white animate-pulse"
                    : isTCRed
                    ? "border-red-500/40 bg-red-500/20 text-red-400 hover:bg-slate-850"
                    : "border-blue-500/40 bg-blue-500/15 text-blue-400 hover:bg-slate-850"
                )}
              >
                TC: {verticalItemsTC.length} act.
              </Badge>
            )}

            {verticalItemsCD.length > 0 && (
              <Badge
                variant="outline"
                onClick={() => onSelectVerticalSpecialty && onSelectVerticalSpecialty("CD")}
                className={cn(
                  "text-xs px-2.5 py-1 font-extrabold flex items-center gap-1.5 shadow-md cursor-pointer transition-all",
                  selectedVerticalSpecialty === "CD"
                    ? "border-orange-500 bg-orange-500/30 text-white animate-pulse"
                    : isCDRed
                    ? "border-red-500/40 bg-red-500/20 text-red-400 hover:bg-slate-850"
                    : "border-orange-500/40 bg-orange-500/15 text-orange-400 hover:bg-slate-850"
                )}
              >
                CD: {verticalItemsCD.length} act.
              </Badge>
            )}
          </div>
        </div>

        {/* MAIN BUILDING STACK FRAMEWORK WITH CONNECTED CONTINUOUS GLOWING PIPES */}
        <div className="flex-1 relative flex flex-col justify-center py-2 z-10 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-800 pr-1">
          <div className="w-full max-w-4xl mx-auto border-2 border-slate-700/80 bg-slate-950/90 rounded-xl shadow-2xl overflow-hidden flex flex-col my-auto relative">
            
            {/* FLOORS STACK WITH UNIFIED CONTINUOUS GLOWING PIPES (VERDE, AZUL, NARANJO) */}
            <div className="divide-y divide-slate-800/80 flex flex-col max-h-[520px] overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-800 relative">
              
              {onSelectVerticalSpecialty && (
                <div className="bg-slate-900/95 px-3 py-2 border-b border-slate-850 flex items-center justify-between shrink-0 select-none sticky top-0 z-30 backdrop-blur-sm shadow-sm">
                  <div className="w-28 md:w-32 shrink-0 flex items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Especialidad</span>
                  </div>
                  <div className="flex-1 grid grid-cols-3 max-w-xl md:max-w-2xl mx-auto px-4 text-[10px] md:text-xs font-black gap-2 md:gap-4 text-center">
                    <button
                      onClick={() => onSelectVerticalSpecialty("EL")}
                      className={cn(
                        "py-1.5 px-1 md:px-2 rounded-lg transition-all border text-center uppercase tracking-wider shadow-sm font-black",
                        selectedVerticalSpecialty === "EL"
                          ? "bg-emerald-500/25 border-emerald-500/50 text-emerald-350 shadow-[0_0_10px_rgba(52,211,153,0.2)]"
                          : "bg-slate-950/40 border-slate-850 text-slate-400 hover:text-white"
                      )}
                    >
                      EL
                    </button>
                    <button
                      onClick={() => onSelectVerticalSpecialty("TC")}
                      className={cn(
                        "py-1.5 px-1 md:px-2 rounded-lg transition-all border text-center uppercase tracking-wider shadow-sm font-black",
                        selectedVerticalSpecialty === "TC"
                          ? "bg-blue-500/25 border-blue-500/50 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                          : "bg-slate-950/40 border-slate-850 text-slate-400 hover:text-white"
                      )}
                    >
                      TC
                    </button>
                    <button
                      onClick={() => onSelectVerticalSpecialty("CD")}
                      className={cn(
                        "py-1.5 px-1 md:px-2 rounded-lg transition-all border text-center uppercase tracking-wider shadow-sm font-black",
                        selectedVerticalSpecialty === "CD"
                          ? "bg-orange-500/25 border-orange-500/50 text-orange-350 shadow-[0_0_10px_rgba(249,115,22,0.2)]"
                          : "bg-slate-950/40 border-slate-850 text-slate-400 hover:text-white"
                      )}
                    >
                      CD
                    </button>
                  </div>
                  <div className="w-14 md:w-16 shrink-0" />
                </div>
              )}

              {/* FLOOR ROWS */}
              {sortedFloors.map((fl) => {
                const isSelected = selectedFloor === fl.floor;
                const isVerticalView = !!onSelectVerticalSpecialty;

                return (
                  <motion.div
                    key={fl.floor}
                    onClick={() => {
                      if (!isVerticalView) {
                        onSelectFloor && onSelectFloor(fl.floor);
                      }
                    }}
                    whileHover={!isVerticalView ? { scale: 1.001, backgroundColor: "rgba(30, 41, 59, 0.9)" } : {}}
                    className={cn(
                      "relative flex items-center justify-between px-3 py-2 transition-all border-l-4 z-20",
                      !isVerticalView && isSelected
                        ? "bg-slate-800/90 border-l-orange-500 shadow-md"
                        : "bg-slate-900/40 border-l-transparent",
                      !isVerticalView ? "cursor-pointer" : "cursor-default"
                    )}
                  >
                    {/* Floor Label Axis (Left) */}
                    <div className="flex items-center gap-2 w-28 md:w-32 shrink-0">
                      <span className="text-[11px] font-extrabold text-slate-300 truncate" title={fl.floor}>
                        {fl.floor}
                      </span>
                    </div>

                    {/* SHAFT COLUMNS GRID WITH CONTINUOUS VERTICAL PIPES & C-ELBOWS (3 COLUMNS: EL | TC | CD) */}
                    <div className="flex-1 grid grid-cols-3 max-w-xl md:max-w-2xl mx-auto relative h-8 md:h-9 px-4">
                      <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-slate-700/45 shadow-[0_0_8px_rgba(148,163,184,0.12)]" />
                      <div className="absolute inset-x-0 bottom-[-9px] h-px bg-slate-600/35" />
                      <StructuralColumn className="left-0" />
                      <StructuralColumn className="left-1/3" />
                      <StructuralColumn className="left-2/3" />
                      <StructuralColumn className="left-full" />
                      
                      {/* COLUMN 1: EL (Verde) */}
                      <div
                        onClick={() => isVerticalView && onSelectVerticalSpecialty("EL")}
                        className={cn(
                          "relative flex items-center justify-center transition-all rounded-md py-0.5",
                          isVerticalView && selectedVerticalSpecialty === "EL" ? "bg-emerald-500/10 border-x border-emerald-500/20" : "",
                          isVerticalView ? "cursor-pointer hover:bg-slate-800/35" : ""
                        )}
                      >
                        {/* Continuous Vertical Pipe Line (Uninterrupted across all floors) */}
                        {activeEL && (
                          <div
                            className={cn(
                              "absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[5px] transition-all z-20 rounded-full bg-gradient-to-b",
                              isELRed
                                ? "from-red-300 via-red-400 to-red-600 shadow-[0_0_15px_rgba(248,113,113,0.9)]"
                                : "from-emerald-300 via-emerald-400 to-emerald-600 shadow-[0_0_15px_rgba(52,211,153,0.85)]"
                            )}
                          />
                        )}
                        {/* Curved Feeder Elbow Loop adosado a la tubería vertical */}
                        {activeEL && (
                          <div
                            className={cn(
                              "absolute left-1/2 top-1/2 -translate-y-1/2 w-8 h-4 border-y-2 border-r-2 rounded-r-lg z-30 transition-all",
                              isELRed
                                ? "border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.9)]"
                                : "border-emerald-300 shadow-[0_0_8px_rgba(34,197,94,0.9)]"
                            )}
                          />
                        )}
                      </div>

                      {/* COLUMN 2: TC (Azul) */}
                      <div
                        onClick={() => isVerticalView && onSelectVerticalSpecialty("TC")}
                        className={cn(
                          "relative flex items-center justify-center transition-all rounded-md py-0.5",
                          isVerticalView && selectedVerticalSpecialty === "TC" ? "bg-blue-500/10 border-x border-blue-500/20" : "",
                          isVerticalView ? "cursor-pointer hover:bg-slate-800/35" : ""
                        )}
                      >
                        {/* Continuous Vertical Pipe Line (Uninterrupted across all floors) */}
                        {activeTC && (
                          <div
                            className={cn(
                              "absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[5px] transition-all z-20 rounded-full bg-gradient-to-b",
                              isTCRed
                                ? "from-red-300 via-red-400 to-red-600 shadow-[0_0_15px_rgba(248,113,113,0.9)]"
                                : "from-sky-300 via-blue-400 to-blue-600 shadow-[0_0_15px_rgba(96,165,250,0.85)]"
                            )}
                          />
                        )}
                        {/* Curved Feeder Elbow Loop adosado a la tubería vertical */}
                        {activeTC && (
                          <div
                            className={cn(
                              "absolute left-1/2 top-1/2 -translate-y-1/2 w-8 h-4 border-y-2 border-r-2 rounded-r-lg z-30 transition-all",
                              isTCRed
                                ? "border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.9)]"
                                : "border-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.9)]"
                            )}
                          />
                        )}
                      </div>

                      {/* COLUMN 3: CD (Naranjo) */}
                      <div
                        onClick={() => isVerticalView && onSelectVerticalSpecialty("CD")}
                        className={cn(
                          "relative flex items-center justify-center transition-all rounded-md py-0.5",
                          isVerticalView && selectedVerticalSpecialty === "CD" ? "bg-orange-500/10 border-x border-orange-500/20" : "",
                          isVerticalView ? "cursor-pointer hover:bg-slate-800/35" : ""
                        )}
                      >
                        {/* Continuous Vertical Pipe Line (Uninterrupted across all floors) */}
                        {activeCD && (
                          <div
                            className={cn(
                              "absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[5px] transition-all z-20 rounded-full bg-gradient-to-b",
                              isCDRed
                                ? "from-red-300 via-red-400 to-red-600 shadow-[0_0_15px_rgba(248,113,113,0.9)]"
                                : "from-amber-300 via-orange-400 to-orange-600 shadow-[0_0_15px_rgba(251,146,60,0.9)]"
                            )}
                          />
                        )}
                        {/* Curved Feeder Elbow Loop adosado a la tubería vertical */}
                        {activeCD && (
                          <div
                            className={cn(
                              "absolute left-1/2 top-1/2 -translate-y-1/2 w-8 h-4 border-y-2 border-r-2 rounded-r-lg z-30 transition-all",
                              isCDRed
                                ? "border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.9)]"
                                : "border-orange-300 shadow-[0_0_8px_rgba(249,115,22,0.9)]"
                            )}
                          />
                        )}
                      </div>

                    </div>

                    {/* Floor Items Count (Right - HIDE IF 0 ACT) */}
                    <div className="w-14 md:w-16 text-right shrink-0">
                      {fl.itemCount > 0 && (
                        <span className="text-[9.5px] text-slate-400 font-semibold">
                          {fl.itemCount} act.
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
