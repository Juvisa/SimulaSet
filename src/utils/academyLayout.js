// Distribución de las clases en la pantalla de la Academia (sin catálogo fijo:
// todo sale de la base de datos y de las clases visibles para el alumno).
// Sirve para cualquier generación (G1, G2, G3…): los módulos `week-NN` se
// muestran como «Semana N» en orden numérico, sin límite de semanas.
export const START_COURSE_ID = 'set-academy';
export const START_MODULE_ID = 'digital-set-start';
export const LAB_MODULE_ID = 'practical-labs';
const WEEK_MODULE = /^week-0*(\d+)$/;
export const isWeekModule = (moduleId) => WEEK_MODULE.test(moduleId || '');
const weekNumber = (moduleId) => Number(WEEK_MODULE.exec(moduleId || '')?.[1] ?? Infinity);

export const weekLabel = (moduleId) => {
  const match = WEEK_MODULE.exec(moduleId || '');
  return match ? `Semana ${match[1]}` : moduleId;
};

const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.lesson_id).localeCompare(String(b.lesson_id));

// `lessons`: filas de academy_lessons ya filtradas para el ámbito activo.
// Cada clase sale con `id` = lesson_id (clave del progreso, como antes) y
// `lesson_uuid` = id de la fila (clave de comentarios y asignaciones).
export const groupAcademyLessons = (lessons = []) => {
  const byModule = {};
  lessons.forEach((lesson) => {
    if (!byModule[lesson.module_id]) byModule[lesson.module_id] = [];
    byModule[lesson.module_id].push({ ...lesson, id: lesson.lesson_id, lesson_uuid: lesson.id });
  });
  Object.values(byModule).forEach((rows) => rows.sort(byPosition));
  const moduleIds = Object.keys(byModule);
  return {
    startLessons: byModule[START_MODULE_ID] || [],
    weekGroups: moduleIds.filter(isWeekModule)
      .sort((a, b) => weekNumber(a) - weekNumber(b))
      .map((moduleId) => ({ moduleId, week: weekLabel(moduleId), lessons: byModule[moduleId] })),
    labLessons: byModule[LAB_MODULE_ID] || [],
    additionalModuleGroups: moduleIds
      .filter((moduleId) => moduleId !== START_MODULE_ID && moduleId !== LAB_MODULE_ID && !isWeekModule(moduleId))
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
      .map((moduleId) => ({ moduleId, lessons: byModule[moduleId] })),
  };
};
