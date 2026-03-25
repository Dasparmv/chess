# Chess Friends

Aplicación web de ajedrez online para jugar con amigos usando React + Vite, Supabase y Netlify.

## Incluye

- registro e inicio de sesión con email y contraseña
- username único por jugador
- creación de partidas privadas
- invitación por enlace o por username
- arranque automático cuando entra el rival
- tablero en tiempo real
- reloj con tiempo base e incremento
- rendición, tablas y revancha
- historial de resultados
- ranking simple por victorias
- marcador acumulado contra rivales

## Stack

- React + Vite
- Supabase Auth
- Supabase Postgres
- Supabase Realtime
- chess.js
- react-chessboard
- Netlify

## 1) Configuración en Supabase

### A. Crea el proyecto

1. Entra a Supabase.
2. Crea un proyecto nuevo.
3. Espera a que termine de provisionarse.

### B. Ejecuta el SQL

1. Abre **SQL Editor**.
2. Copia todo el contenido de `supabase/schema.sql`.
3. Ejecútalo completo.

### C. Auth

En **Authentication > Providers > Email**:

- activa **Email**
- para uso con amigos, puedes dejar activa o desactivar la confirmación de email
- si quieres entrar más rápido, desactiva **Confirm email**

### D. Realtime

En **Database > Replication**:

- habilita realtime para la tabla `games`

### E. Variables del proyecto

En **Project Settings > API** copia:

- `Project URL`
- `anon public key`

Las vas a usar en Netlify.

## 2) Configuración local

```bash
npm install
cp .env.example .env
```

Llena `.env` con:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_SUPABASE_ANON_KEY
```

Luego:

```bash
npm run dev
```

## 3) Despliegue en Netlify

### Opción recomendada: desde GitHub

1. Sube esta carpeta a un repositorio.
2. En Netlify elige **Add new site > Import an existing project**.
3. Conecta tu repositorio.
4. Usa esta configuración:

- **Build command:** `npm run build`
- **Publish directory:** `dist`

5. En variables de entorno agrega:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

6. Despliega.

El archivo `netlify.toml` ya incluye el redirect para que las rutas del frontend funcionen bien.

## 4) Flujo de uso

1. Cada amigo crea su cuenta.
2. Un jugador crea partida.
3. Puede dejarla abierta o escribir el `username` del rival.
4. Comparte el enlace de la partida.
5. Cuando el rival entra y pulsa **Unirme a la partida**, la partida empieza automáticamente.
6. Los movimientos y relojes se sincronizan en tiempo real.

## 5) Estructura

```text
src/
  components/
  contexts/
  lib/
  pages/
  styles/
supabase/
  schema.sql
```

## 6) Notas importantes

- La promoción de peón se resuelve por defecto a reina para mantener el flujo simple.
- La app está pensada para partidas privadas entre amigos, no para tráfico masivo.
- El ranking usa estadísticas acumuladas guardadas en `user_stats`.
- El marcador contra cada rival se calcula desde el historial terminado.

## 7) Comandos

```bash
npm install
npm run dev
npm run build
npm run preview
```
