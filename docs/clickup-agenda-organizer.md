# ClickUp Agenda Organizer Prompt

## Objetivo
Construir una nueva app dentro del menú principal que permita planear la agenda semanal de cada integrante del equipo directamente sobre los sprints de ClickUp desde el celular. El flujo ideal es:

1. Selecciono una persona y un sprint en la parte superior.
2. Veo una fila/columna por cada día del sprint con su fecha y las horas totales asignadas.
3. Cada tarea aparece como una tarjeta (título completo visible). 
4. Puedo arrastrar y soltar tareas entre días (con scroll horizontal suave en mobile). Cuando suelto una tarjeta:
   - Actualiza la tarea en ClickUp (due_date/start_date dentro del día seleccionado).
   - Recalcula automáticamente las horas del día origen y destino.
5. Si toco la tarjeta entro a un panel listo para edición (título, objetivo, persona/assignee, tiempo estimado, día).
6. Cada tarjeta también debe tener un dropdown rápido para moverla de día cuando arrastrar sea incómodo en mobile.

## Datos necesarios
- **Team members**: se cargan desde Firebase (`loadTeamMembersFromFirebase`) para poblar el selector de personas. Debe incluir id, nombre y apodos.
- **Sprints**: se cargan desde Firebase (`loadSprintConfigFromFirebase`). Cada sprint aporta `id`, `name`, `startDate`, `endDate`, `firstMonday` (siempre usar siete días consecutivos a partir de ese valor; si falta, derivarlo del `startDate`).
- **Tareas del sprint**: provienen de ClickUp list endpoint `GET /list/{sprintId}/task`. Filtrar en frontend por `assigneeId`. El backend debe exponer un wrapper `/api/clickup/sprint-planner` para no revelar tokens.

## API propuesta
`/api/clickup/sprint-planner`

### GET
- Query params: `sprintId`, `assigneeId`, `includeDone` (opcional, default false).
- Respuesta:
  ```json
  {
    "ok": true,
    "sprint": { "id": "", "name": "", "startDate": 0, "endDate": 0, "firstMonday": 0 },
    "tasks": [
      {
        "id": "",
        "name": "",
        "status": "to do",
        "dueDate": 0,
        "startDate": 0,
        "timeEstimate": 7200000,
        "assigneeIds": ["123"],
        "url": "",
        "description": "...",
        "objective": "",
        "acceptanceCriteria": ""
      }
    ]
  }
  ```

### PATCH
- Body:
  ```json
  {
    "taskId": "",
    "updates": {
      "name": "Nuevo título",
      "objective": "Texto objetivo",
      "acceptanceCriteria": "- item",
      "assigneeId": "123",
      "dueDate": 1732320000000,
      "startDate": 1732320000000,
      "timeEstimateMs": 7200000
    }
  }
  ```
- Debe enviar `markdown_description` reconstruido (## Objective / ## Acceptance Criteria) cuando se suministre objetivo/criterios.

## Reglas de UI
- **Encabezado** con `AppHeader` (botón Back al home).
- **Selectores superiores**:
  - Persona: combobox searchable con avatar inicial opcional.
  - Sprint: dropdown con nombre y rango de fechas.
  - Mostrar badges con horas totales asignadas y tareas abiertas.
- **Calendario semanal**:
  - Contenedor horizontal con scroll suave (`overflow-x-auto`, snap opcional).
  - Cada día es una columna (`min-w-[260px]`) con:
    - Fecha formateada (ej. "Lun 18 Nov").
    - Chip de horas (`Total: 6.5h`).
    - Drop zone con borde punteado cuando no hay tareas.
  - Tareas: tarjeta dark (`rounded-2xl`, `border-zinc-800`) con:
    - Nombre completo (multiline).
    - Tiempo estimado (`2h`), estado y enlace a ClickUp.
    - Dropdown `<select>` para elegir día del sprint + “Sin día”.
    - `draggable` nativo, con `onDragStart/onDrop` y feedback visual (`opacity-60` mientras se arrastra).
  - Zona “Sin día / Fuera del sprint” para tareas sin due_date o fuera del rango.

- **Interacciones**:
  - Drag & drop actualiza instantáneamente el UI y llama `PATCH`. Si falla, revertir y mostrar toast.
  - Dropdown de día dispara el mismo update handler.
  - Tap abre un **drawer modal** con formulario:
    - Inputs controlados (nombre, objetivo, criterios, assignee, día, horas).
    - Botones `Guardar cambios`, `Cancelar`, link “Abrir en ClickUp”.
    - Al guardar, cierra modal, refresca tareas, muestra toast.

- **Estado vacío y errores**:
  - Mensaje cuando no hay sprints o miembros configurados.
  - Mensaje cuando no hay tareas asignadas para ese combo.
  - Indicadores de carga (`spinner`) mientras se consultan datos.

- **Mobile-first**:
  - Scroll horizontal para columnas.
  - Controles grandes y accesibles (`text-base`, `min-h-[44px]`).
  - Drawer ocupa toda la pantalla en mobile.

## Validaciones / Edge cases
- Mostrar advertencia si el sprint carece de `firstMonday` y se deriva la semana.
- Si la tarea no tiene `time_estimate`, asumir 0h pero permitir editarla.
- Al cambiar de persona o sprint, abortar requests previos y resetear estado de tareas.
- El dropdown debe listar los siete días + “Unplanned”.
- Si el usuario intenta mover una tarea fuera del sprint, bloquear y mostrar alerta.

## Métricas de éxito / QA rápido
- Puedo organizar todas las tareas de una persona arrastrando tarjetas entre días sin usar una laptop.
- Luego de soltar una tarea, la puedo abrir en ClickUp y verificar que el due date cambió al día correcto.
- Al actualizar horas o título desde el panel, el cambio se refleja en ClickUp y en la UI al refrescar.
- Ningún request expone el token de ClickUp al cliente (solo a través del API interno).

