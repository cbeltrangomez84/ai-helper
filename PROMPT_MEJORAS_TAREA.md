# PROMPT: Mejoras en el Sistema de Creación de Tareas

## Contexto del Sistema Actual

El sistema actual permite crear tareas de ClickUp de dos formas:
1. **Desde cero**: Usando `TaskCreator` - graba audio, genera resumen estructurado y crea la tarea
2. **Desde Firebase**: Usando `TaskDetailView` - toma una tarea guardada en Firebase, permite agregar detalles con audio y crear la tarea

### Flujo Actual
- El usuario graba audio o escribe texto
- El sistema procesa el audio/texto y genera un resumen estructurado con: `title`, `objective`, `acceptanceCriteria`
- Se muestra el resumen formateado
- El usuario puede editar con voz usando el botón "Edit with voice"
- Al presionar "Create ClickUp task", se crea la tarea directamente en ClickUp

### Componentes Existentes
- `TaskCreator.tsx`: Componente principal para crear tareas desde cero
- `TaskDetailView.tsx`: Componente para procesar tareas desde Firebase
- `FirebaseTasksManager.tsx`: Lista de tareas pendientes de Firebase
- API `/api/clickup`: Endpoint que crea tareas en ClickUp
- API `/api/wispr`: Endpoint que procesa transcripciones y genera el resumen estructurado
- Configuración de sprints: `firebaseSprintConfig.ts` - gestiona sprints desde ClickUp
- Miembros del equipo: `firebaseTeamMembers.ts` - gestiona miembros del equipo

## Objetivo de las Mejoras

Empoderar la herramienta para que el usuario tenga control total sobre los parámetros de la tarea antes de crearla, permitiendo edición tanto manual como asistida por IA.

## Requisitos Detallados

### 1. Mejoras en la Captura de Audio/Texto

#### 1.1 Acceso Universal al Botón de Audio
- **Requisito**: El botón de audio debe estar siempre disponible y funcionar igual que hacer clic en la casilla de texto
- **Comportamiento esperado**:
  - Al hacer clic en el botón de audio, debe iniciar la grabación
  - El audio grabado se transcribe y se copia automáticamente en la casilla de texto
  - Si el usuario no puede hablar, puede editar el texto directamente en la casilla
  - La casilla de texto debe ser editable en todo momento (excepto durante la grabación activa)

#### 1.2 Flujo Unificado de Entrada
- **Requisito**: Unificar el flujo de entrada de datos (audio o texto)
- **Comportamiento esperado**:
  - El usuario puede:
    1. Presionar el botón de audio → grabar → el texto se copia en la casilla
    2. Hacer clic en la casilla de texto → escribir directamente
    3. Combinar ambos: grabar audio y luego editar el texto manualmente
  - Después de tener el texto (ya sea de audio o escrito), debe pasar por el proceso de generar la tarea

### 2. Vista de Edición de Tarea Antes de Crear

#### 2.1 Estructura de la Vista de Edición
Después de procesar el audio/texto inicial, se debe mostrar una vista donde el usuario puede revisar y editar todos los parámetros de la tarea antes de crearla.

**Parámetros editables**:
1. **Título** (en inglés)
   - Campo de texto editable
   - Puede seleccionar y modificar directamente
   - Puede usar el botón de edición con IA

2. **Objetivo**
   - Campo de texto editable (textarea)
   - Puede seleccionar y modificar directamente
   - Puede usar el botón de edición con IA

3. **Criterio de Aceptación**
   - Campo de texto editable (textarea)
   - Puede seleccionar y modificar directamente
   - Puede usar el botón de edición con IA

4. **Lista Principal**
   - Selector (combo box) con lista de listas disponibles de ClickUp
   - Por defecto: "General" (que pertenece al Backend, obtenida de `firebaseSprintConfig.ts` - `backEnGeneralListId`)
   - El usuario puede cambiar la lista principal si lo desea
   - Todas las tareas se crean en esta lista principal
   - Esta es la lista donde reside la tarea

5. **Persona Asignada**
   - Selector (combo box) con lista de miembros del equipo
   - La IA sugiere inicialmente a quién asignar basándose en el contenido
   - El usuario puede cambiar la asignación manualmente
   - Los miembros del equipo se cargan desde `firebaseTeamMembers.ts`

6. **Sprint Asignado** (Lista Secundaria)
   - Selector (combo box) con lista de sprints disponibles
   - La IA sugiere inicialmente a qué sprint asignar
   - El usuario puede cambiar el sprint manualmente
   - Los sprints se cargan desde `firebaseSprintConfig.ts`
   - **IMPORTANTE**: El sprint es una lista secundaria en ClickUp, no la lista principal
   - La tarea pertenece a la lista principal pero también tiene el sprint como lista secundaria
   - La fecha de inicio se establece automáticamente al primer lunes del sprint seleccionado

#### 2.2 Edición Manual de Campos
- **Requisito**: Cada campo debe ser editable directamente mediante selección y modificación de texto
- **Comportamiento esperado**:
  - Los campos de texto (título, objetivo, criterio de aceptación) son editables
  - El usuario puede seleccionar cualquier parte del texto y modificarlo
  - Los cambios se reflejan inmediatamente en la vista previa

#### 2.3 Edición Asistida por IA (Botón General)
- **Requisito**: Un botón general que permite editar cualquier campo usando ChatGPT
- **Comportamiento esperado**:
  - Botón visible cerca de cada campo editable (o un botón general que permite especificar qué campo editar)
  - Al hacer clic, se abre un modal o área donde el usuario puede escribir instrucciones como:
    - "En el título, necesito que hagas esto: [instrucción]"
    - "Modifica el objetivo para que incluya: [instrucción]"
    - "Cambia el criterio de aceptación para que diga: [instrucción]"
  - El sistema envía al backend:
    - El texto actual del campo
    - La instrucción del usuario
    - El contexto completo de la tarea (otros campos)
  - El backend procesa con ChatGPT y devuelve el campo modificado
  - Se muestra una vista previa de los cambios antes de aplicarlos
  - El usuario puede aceptar o rechazar los cambios

#### 2.4 Vista Previa de Cambios
- **Requisito**: Después de aplicar cambios con IA, mostrar qué cambió
- **Comportamiento esperado**:
  - Mostrar el texto anterior y el nuevo texto lado a lado o con diferencias resaltadas
  - Permitir al usuario aceptar o rechazar los cambios
  - Si acepta, los cambios se aplican al campo correspondiente

### 3. Generación de la Tarea

#### 3.1 Botón "Generar Tarea"
- **Requisito**: Botón final que crea la tarea con todos los parámetros editados
- **Comportamiento esperado**:
  - Solo se habilita cuando todos los campos requeridos están completos (título, objetivo)
  - Al hacer clic, envía todos los parámetros al endpoint `/api/clickup`:
    ```json
    {
      "title": "...",
      "objective": "...",
      "acceptanceCriteria": "...",
      "primaryListId": "...", // ID de la lista principal (por defecto "General" del Backend)
      "assigneeId": "...",     // ID del miembro del equipo
      "sprintId": "...",       // ID del sprint (lista secundaria)
      "startDate": 1234567890  // Timestamp del primer lunes del sprint
    }
  ```
  - Muestra estado de carga mientras se crea la tarea
  - Muestra mensaje de éxito con enlace a la tarea creada

#### 3.2 Manejo de Tareas desde Firebase
- **Requisito**: Si la tarea se creó desde Firebase, marcar como completada
- **Comportamiento esperado**:
  - Después de crear la tarea exitosamente en ClickUp
  - Si el origen fue Firebase (componente `TaskDetailView`), llamar a `moveTaskToCompleted`
  - Guardar la URL de la tarea de ClickUp en Firebase
  - Actualizar la lista de tareas pendientes

### 4. Integración con Listas, Sprints y Miembros del Equipo

#### 4.1 Carga de Lista Principal
- **Requisito**: Cargar lista principal por defecto y permitir selección
- **Implementación**:
  - Usar `getBackEnGeneralListIdFromConfig()` para obtener la lista principal por defecto
  - Esta lista corresponde a "General" (que pertenece al Backend)
  - Esta lista se establece como valor por defecto en el selector
  - El selector debe permitir cambiar la lista principal si es necesario
  - Por ahora, todas las tareas se crean en la lista principal (por defecto "General" del Backend)
  - La lista principal es donde reside la tarea en ClickUp

#### 4.2 Carga de Sprints (Lista Secundaria)
- **Requisito**: Cargar sprints disponibles desde la configuración
- **Implementación**:
  - Usar `loadSprintConfigFromFirebase()` para obtener la configuración
  - Extraer la lista de sprints de `config.sprints`
  - Mostrar en el selector con formato: `Sprint {number}: {name}` o solo `{name}` si no hay número
  - Ordenar por fecha de inicio (más recientes primero)
  - **IMPORTANTE**: El sprint es una lista secundaria, no la lista principal
  - La tarea se crea en la lista principal pero también se asocia al sprint como lista secundaria

#### 4.3 Carga de Miembros del Equipo
- **Requisito**: Cargar miembros del equipo disponibles
- **Implementación**:
  - Usar `loadTeamMembersFromFirebase()` para obtener los miembros
  - Extraer la lista de miembros de `data.members`
  - Mostrar en el selector con formato: `{name} ({email})` o solo `{name}`
  - Ordenar alfabéticamente por nombre

#### 4.4 Sugerencia Inicial por IA
- **Requisito**: La IA debe sugerir inicialmente el sprint y la persona asignada
- **Implementación**:
  - Al generar el resumen inicial, el backend debe analizar el contenido y sugerir:
    - Sprint más apropiado (basándose en fechas y contexto)
    - Miembro del equipo más apropiado (basándose en el contenido y los `howToAddress` de cada miembro)
  - Estas sugerencias se envían junto con el resumen estructurado
  - Los selectores se inicializan con estos valores sugeridos
  - El usuario puede cambiarlos si lo desea
  - La lista principal siempre se inicializa con "General" del Backend (no requiere sugerencia de IA)

#### 4.5 Fecha de Inicio Automática
- **Requisito**: La fecha de inicio se establece automáticamente al primer lunes del sprint
- **Implementación**:
  - Cuando se selecciona un sprint, obtener su `firstMonday` de la configuración
  - Si el sprint tiene `firstMonday`, usar ese valor
  - Si no, calcular el primer lunes del sprint basándose en `startDate`
  - Enviar esta fecha como `startDate` al crear la tarea

### 5. Cambios en el Backend

#### 5.1 Endpoint `/api/wispr` - Respuesta Ampliada
- **Requisito**: El endpoint debe devolver sugerencias de sprint y asignado
- **Cambios necesarios**:
  ```typescript
  {
    formatted?: string | null
    title?: string
    objective?: string
    acceptanceCriteria?: string
    suggestedSprintId?: string | null  // Nuevo
    suggestedAssigneeId?: string | null // Nuevo
  }
  ```
- **Lógica**:
  - Analizar el contenido de la transcripción
  - Buscar referencias a nombres de miembros del equipo usando `howToAddress`
  - Buscar referencias a sprints o fechas
  - Devolver las sugerencias más apropiadas

#### 5.2 Endpoint `/api/clickup` - Parámetros Ampliados
- **Requisito**: Aceptar parámetros adicionales para lista principal, asignación y sprint
- **Cambios necesarios**:
  ```typescript
  type ClickUpTaskPayload = {
    title?: string
    objective?: string
    acceptanceCriteria?: string
    primaryListId?: string | null  // Nuevo: ID de la lista principal (por defecto "Back en general")
    assigneeId?: string | null     // Nuevo: ID del miembro del equipo
    sprintId?: string | null        // Nuevo: ID del sprint (lista secundaria)
    startDate?: number | null      // Nuevo: Timestamp del primer lunes del sprint
  }
  ```
- **Lógica**:
  - **Crear tarea en lista principal**: 
    - Si se proporciona `primaryListId`, crear la tarea en esa lista
    - Si no se proporciona, usar `backEnGeneralListId` de la configuración como valor por defecto (corresponde a "General" del Backend)
    - La tarea siempre se crea en una lista principal
  - **Asignar sprint como lista secundaria**:
    - Si se proporciona `sprintId`, agregar el sprint como lista secundaria usando la API de ClickUp
    - ClickUp permite que una tarea pertenezca a múltiples listas (lista principal + lista secundaria)
    - Usar el endpoint de ClickUp para agregar la lista secundaria después de crear la tarea
  - **Asignar miembro**:
    - Si se proporciona `assigneeId`, asignar la tarea al miembro usando la API de ClickUp
  - **Establecer fecha de inicio**:
    - Si se proporciona `startDate`, establecer la fecha de inicio
  - Mantener compatibilidad con el comportamiento actual si no se proporcionan estos parámetros

#### 5.3 Nuevo Endpoint `/api/task/edit-field` (Opcional)
- **Requisito**: Endpoint para editar campos individuales con IA
- **Estructura**:
  ```typescript
  POST /api/task/edit-field
  {
    "field": "title" | "objective" | "acceptanceCriteria",
    "currentValue": "...",
    "instruction": "...",
    "context": {
      "title": "...",
      "objective": "...",
      "acceptanceCriteria": "..."
    }
  }
  ```
- **Respuesta**:
  ```typescript
  {
    "newValue": "...",
    "explanation": "..." // Opcional: explicación de los cambios
  }
  ```

### 6. Flujo Completo Mejorado

#### 6.1 Flujo desde Cero (TaskCreator)
1. Usuario presiona botón de audio o hace clic en casilla de texto
2. Graba audio o escribe texto
3. El texto se muestra en la casilla (editable)
4. Usuario puede seguir editando el texto manualmente o presionar "Procesar"
5. Sistema procesa el texto y genera resumen estructurado con sugerencias
6. **NUEVO**: Se muestra vista de edición con todos los parámetros:
   - Título (editable)
   - Objetivo (editable)
   - Criterio de aceptación (editable)
   - Lista principal (selector, por defecto "General" del Backend)
   - Persona asignada (selector con sugerencia de IA)
   - Sprint asignado (selector con sugerencia de IA - lista secundaria)
7. Usuario puede:
   - Editar cualquier campo manualmente
   - Usar botón de edición con IA para cualquier campo
   - Cambiar asignación y sprint
8. Usuario presiona "Generar tarea"
9. Se crea la tarea en ClickUp con todos los parámetros
10. Se muestra confirmación con enlace

#### 6.2 Flujo desde Firebase (TaskDetailView)
1. Usuario selecciona una tarea de Firebase
2. Se muestra el texto original de Firebase
3. Usuario presiona botón de audio o hace clic en casilla de texto
4. Graba audio adicional o escribe texto adicional
5. El texto adicional se combina con el texto original de Firebase
6. Sistema procesa el texto combinado y genera resumen estructurado con sugerencias
7. **NUEVO**: Se muestra vista de edición con todos los parámetros (igual que flujo desde cero):
   - Título (editable)
   - Objetivo (editable)
   - Criterio de aceptación (editable)
   - Lista principal (selector, por defecto "General" del Backend)
   - Persona asignada (selector con sugerencia de IA)
   - Sprint asignado (selector con sugerencia de IA - lista secundaria)
8. Usuario puede editar todos los parámetros
9. Usuario presiona "Generar tarea"
10. Se crea la tarea en ClickUp
11. Se marca la tarea de Firebase como completada
12. Se muestra confirmación con enlace

### 7. Consideraciones de UI/UX

#### 7.1 Diseño de la Vista de Edición
- **Layout**: Formulario vertical con secciones claramente separadas
- **Campos de texto**: 
  - Título: Input de una línea con estilo destacado
  - Objetivo: Textarea con altura mínima adecuada
  - Criterio de aceptación: Textarea con altura mínima adecuada
- **Selectores**:
  - Estilo consistente con el resto de la aplicación
  - Mostrar valor seleccionado claramente
  - Indicar si el valor fue sugerido por IA (badge o texto pequeño)
  - Lista principal: mostrar claramente que es la lista principal
  - Sprint: mostrar claramente que es una lista secundaria (puede usar etiqueta o descripción)
- **Botones de edición con IA**:
  - Botón pequeño junto a cada campo o botón general
  - Modal o área expandible para ingresar instrucciones
  - Indicador de carga mientras se procesa
  - Vista previa de cambios antes de aplicar

#### 7.2 Estados y Validación
- **Validación**: 
  - Título y objetivo son requeridos
  - Mostrar mensajes de error claros si faltan campos requeridos
- **Estados de carga**:
  - Procesando audio/texto
  - Generando resumen
  - Editando con IA
  - Creando tarea
- **Feedback visual**:
  - Indicadores claros de qué campo está siendo editado
  - Diferencias resaltadas en vista previa de cambios
  - Mensajes de éxito/error bien visibles

### 8. Compatibilidad y Migración

#### 8.1 Compatibilidad hacia Atrás
- **Requisito**: Mantener compatibilidad con el comportamiento actual
- **Implementación**:
  - Si no se proporcionan `assigneeId` o `sprintId`, usar la lógica actual
  - Si no hay sugerencias de IA, los selectores pueden quedar vacíos o con valores por defecto
  - El endpoint `/api/clickup` debe funcionar con y sin los nuevos parámetros

#### 8.2 Migración Gradual
- **Requisito**: Permitir que ambas versiones coexistan temporalmente si es necesario
- **Implementación**:
  - Los componentes existentes siguen funcionando
  - Los nuevos componentes pueden ser versiones mejoradas que reemplazan gradualmente los antiguos

## Resumen de Cambios Principales

1. ✅ Botón de audio siempre disponible y funcional como casilla de texto
2. ✅ Casilla de texto editable en todo momento
3. ✅ Vista de edición completa antes de crear la tarea
4. ✅ Edición manual de todos los campos
5. ✅ Edición asistida por IA con botón general
6. ✅ Selector para lista principal (por defecto "General" del Backend)
7. ✅ Selectores para sprint (lista secundaria) y persona asignada
8. ✅ Sugerencias iniciales por IA para sprint y asignado
9. ✅ Fecha de inicio automática (primer lunes del sprint)
10. ✅ Backend ampliado para manejar lista principal y lista secundaria (sprint)
11. ✅ Manejo correcto de tareas desde Firebase

## Notas Técnicas

### Listas en ClickUp
- **Lista Principal**: Todas las tareas se crean en una lista principal. Por defecto es "General" (que pertenece al Backend, obtenida de `firebaseSprintConfig.ts` - `backEnGeneralListId`). El usuario puede cambiar esta lista mediante un selector.
- **Lista Secundaria (Sprint)**: ClickUp permite que una tarea pertenezca a múltiples listas. El sprint se agrega como lista secundaria después de crear la tarea en la lista principal. Esto permite que la tarea pertenezca tanto a la lista principal como al sprint.

### Implementación de Listas
- La lista principal se especifica al crear la tarea usando el parámetro `list_id` en el endpoint de creación
- El sprint (lista secundaria) se agrega después de crear la tarea usando el endpoint de ClickUp para agregar listas secundarias
- Los sprints se obtienen de `firebaseSprintConfig.ts`
- Los miembros del equipo se obtienen de `firebaseTeamMembers.ts`

### API de ClickUp
- La asignación de tareas en ClickUp requiere usar la API de ClickUp para actualizar la tarea después de crearla
- La fecha de inicio se establece usando el campo `start_date` en la API de ClickUp
- La asignación de miembros se hace usando el campo `assignees` en la API de ClickUp
- Para agregar una lista secundaria (sprint), usar el endpoint de ClickUp para agregar la tarea a otra lista

