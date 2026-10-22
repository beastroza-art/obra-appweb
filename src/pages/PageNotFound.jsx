import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function PageNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
      <div className="text-center max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-6xl font-black text-slate-800">404</h1>
        <p className="text-lg font-semibold text-slate-700 mt-2">Página no encontrada</p>
        <p className="text-xs text-muted-foreground mt-1 mb-6">
          La ruta a la que intentas acceder no existe o fue integrada directamente en el Dashboard central.
        </p>
        <Button asChild className="gap-2 bg-orange-600 hover:bg-orange-700">
          <Link to="/">
            <Home className="h-4 w-4" />
            Volver al Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
