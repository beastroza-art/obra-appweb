/**
 * Normaliza cualquier URL de imagen para que pase a través del proxy /uploads de Vite,
 * limpiando 'http://localhost:3001' de registros antiguos guardados en la base de datos.
 */
export function getImageUrl(path) {
  if (!path) return '';

  // 1. Si la URL guardada en SQLite trae 'http://localhost:3001' o la IP del servidor, se lo removemos para usar ruta relativa:
  if (path.includes('localhost:3001')) {
    return path.replace('http://localhost:3001', '');
  }
  if (path.includes('192.168.1.158:3001')) {
    return path.replace('http://192.168.1.158:3001', '');
  }

  // 2. Si ya viene con protocolo externo o base64, la dejamos tal cual:
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }

  // 3. Aseguramos que la ruta comience con '/'
  return path.startsWith('/') ? path : `/${path}`;
}
