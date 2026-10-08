import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePermissions } from "@/lib/PermissionsContext";

const ProjectFilterContext = createContext(null);

const STORAGE_KEY = "global_selected_project";

function syncLegacyStorage(projectName) {
  try {
    const dash = sessionStorage.getItem("dashboard_filters");
    if (dash) {
      const parsed = JSON.parse(dash);
      parsed.project = projectName || "";
      sessionStorage.setItem("dashboard_filters", JSON.stringify(parsed));
    }
  } catch {}
  try {
    const mp = sessionStorage.getItem("masterplan_filters");
    if (mp) {
      const parsed = JSON.parse(mp);
      parsed.project = projectName || "";
      sessionStorage.setItem("masterplan_filters", JSON.stringify(parsed));
    }
  } catch {}
}

export function ProjectFilterProvider({ children }) {
  const { hasAccessToProject, isAdmin, isLoading: loadingPermissions } = usePermissions();

  const [selectedProject, setSelectedProjectState] = useState(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        if (stored === "__ALL__" || stored === "all" || stored === "") {
          return "";
        }
        return stored;
      }
      return "";
    } catch {
      return "";
    }
  });

  const setSelectedProject = useCallback((project) => {
    const normalized = !project || project === "all" || project === "__ALL__" ? "" : String(project).trim();
    setSelectedProjectState(normalized);
    try {
      // Guardar explícitamente "__ALL__" cuando sea vacío para recordar que el usuario eligió "Todas"
      // y prevenir que una recarga (F5) restaure obras viejas
      sessionStorage.setItem(STORAGE_KEY, normalized || "__ALL__");
      // Sincronizar también dashboard_filters y masterplan_filters en sessionStorage
      syncLegacyStorage(normalized);
    } catch (e) {
      console.warn("Error guardando global_selected_project en sessionStorage:", e);
    }
  }, []);

  // Si el usuario no es admin y la obra elegida ya no está en sus obras permitidas, resetear
  useEffect(() => {
    if (!loadingPermissions && selectedProject && !isAdmin) {
      if (!hasAccessToProject(selectedProject)) {
        setSelectedProject("");
      }
    }
  }, [loadingPermissions, selectedProject, isAdmin, hasAccessToProject, setSelectedProject]);

  const value = {
    selectedProject, // "" representa "Todas las obras", o el nombre de la obra seleccionada
    setSelectedProject,
    isAll: !selectedProject || selectedProject === "all" || selectedProject === "__ALL__",
  };

  return (
    <ProjectFilterContext.Provider value={value}>
      {children}
    </ProjectFilterContext.Provider>
  );
}

export function useProjectFilter() {
  const context = useContext(ProjectFilterContext);
  if (!context) {
    throw new Error("useProjectFilter debe ser usado dentro de un ProjectFilterProvider");
  }
  return context;
}
