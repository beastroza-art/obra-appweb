// En el navegador siempre usamos la ruta relativa '/api' para que el proxy de Vite
// (o Nginx en producción) lo reenvíe internamente al backend en el puerto 3001.
// Esto evita bloqueos de seguridad del navegador (CORS y Private Network Access PNA).
const isBrowserWithProxy = typeof window !== "undefined" && window.location.port !== "3001";
const API_URL = isBrowserWithProxy ? "/api" : (import.meta.env.VITE_API_URL || "/api");
const STORAGE_KEY = "dgc-auth-user";

function getAuthHeaders() {
  try {
    const user = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return user.email ? { "x-user-email": user.email } : {};
  } catch {
    return {};
  }
}

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let message = "Error en la petición";

    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  return response.json();
}

async function uploadPhoto(file) {
  const formData = new FormData();
  formData.append("photo", file);

  const response = await fetch(`${API_URL}/upload`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(), // Incluye cabeceras de auth también en los envíos FormData
    },
    body: formData,
  });

  if (!response.ok) {
    let message = "Error subiendo imagen";

    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  return response.json();
}

export const api = {
  get: (endpoint) => request(endpoint),

  post: (endpoint, data) =>
    request(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  put: (endpoint, data) =>
    request(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (endpoint) =>
    request(endpoint, {
      method: "DELETE",
    }),

  uploadPhoto,
};
