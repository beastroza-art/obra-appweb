import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from "@/pages/PageNotFound";
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Vista3D from './pages/Vista3D';
import MasterPlan from './pages/MasterPlan';
import ItemDetail from './pages/ItemDetail';
import Workers from './pages/Workers';
import Users from './pages/Users';
import Activities from './pages/Activities';
import Restrictions from './pages/Restrictions';
import ProductivityAnalytics from './pages/ProductivityAnalytics';
import { PermissionsProvider } from './lib/PermissionsContext';
import { ProjectFilterProvider } from './lib/ProjectFilterContext';
import Login from './pages/Login';

const AuthenticatedApp = () => {
  const { isAuthenticated, isLoadingAuth, isLoadingPublicSettings } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated && location.pathname !== '/login') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/vista-3d" element={<Vista3D />} />
        <Route path="/master-plan" element={<MasterPlan />} />
        <Route path="/item/:id" element={<ItemDetail />} />
        <Route path="/workers" element={<Workers />} />
        <Route path="/users" element={<Users />} />
        <Route path="/activities" element={<Activities />} />
        <Route path="/restrictions" element={<Restrictions />} />
        <Route path="/analytics" element={<ProductivityAnalytics />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <PermissionsProvider>
          <ProjectFilterProvider>
            <Router>
              <AuthenticatedApp />
            </Router>
            <Toaster />
          </ProjectFilterProvider>
        </PermissionsProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
