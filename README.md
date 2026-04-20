# Asistencia JEC - Sistema de Control

Sistema de asistencia para Talleres de Jornada Escolar Completa (JEC).

## Características
- Gestión de Docentes y Talleres.
- Carga masiva de estudiantes mediante CSV.
- Registro de asistencia con estados (Presente/Ausente).
- Historial expandible con edición y eliminación de sesiones.
- Exportación de reportes de asistencia.

## Despliegue en Vercel

1. Sube este código a un repositorio de GitHub.
2. En el panel de Vercel, importa el proyecto.
3. Configura las siguientes Variables de Entorno (Environment Variables):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Vercel detectará automáticamente que es un proyecto de Vite y lo publicará.

## Desarrollo Local

1. Clona el repositorio.
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Crea un archivo `.env` basado en `.env.example` con tus llaves de Supabase.
4. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```
