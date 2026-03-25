Reemplaza estos archivos en tu proyecto actual:

- src/contexts/AuthContext.jsx
- src/pages/DashboardPage.jsx

Luego haz push a GitHub y redeploy en Netlify.

Qué corrige:
- evita que la app se quede colgada en "Cargando" al volver después de un rato
- hace más estable la restauración de sesión de Supabase
- evita bloqueos por callbacks async de auth
- recarga el panel al volver a la pestaña o al recuperar foco
- añade timeout y recarga manual del panel
