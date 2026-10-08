import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';

const PermissionsContext = createContext(null);

export function PermissionsProvider({ children }) {
  const { user: currentUser, isLoadingAuth } = useAuth();

  const value = useMemo(() => {
    const rawRole = String(currentUser?.role || 'viewer').trim().toLowerCase();
    const userRole = rawRole === 'administrador' ? 'admin' : rawRole;
    const allowedProjects = currentUser?.allowed_projects || [];

    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isViewer = userRole === 'viewer';

    const hasAccessToProject = (projectName) => {
      if (isAdmin) return true;
      return allowedProjects.includes(projectName);
    };

    return {
      currentUser,
      userRole,
      allowedProjects,
      isLoading: isLoadingAuth,
      hasAccessToProject,
      isAdmin,
      isSupervisor,
      isViewer,
      canEditUsers: isAdmin,
      canCreateProjects: isAdmin,
      canCreateItems: isAdmin || isSupervisor || isViewer,
      canCreateReports: isAdmin || isSupervisor || isViewer,
      canDelete: isAdmin,
      canViewPersonal: isAdmin || isSupervisor,
      canManagePersonal: isAdmin || isSupervisor,
      canExport: isAdmin || isSupervisor,
      canViewProductivity: isAdmin || isSupervisor,
      showPersonalNav: isAdmin || isSupervisor,
      showUsersNav: isAdmin,
    };
  }, [currentUser, isLoadingAuth]);

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);

  if (!context) {
    throw new Error('usePermissions must be used within PermissionsProvider');
  }

  return context;
}