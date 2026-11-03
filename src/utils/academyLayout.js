// Distribución de las clases en la pantalla de la Academia (sin catálogo fijo:
// todo sale de la base de datos y de las clases visibles para el alumno).
export const START_COURSE_ID = 'set-academy';
export const START_MODULE_ID = 'digital-set-start';
export const LAB_MODULE_ID = 'practical-labs';
export const WEEK_ORDER = ['week-01', 'week-02', 'week-03', 'week-04'];
const SPECIAL_MODULE_IDS = new Set([START_MODULE_ID, ...WEEK_ORDER, LAB_MODULE_ID]);

export const weekLabel = (moduleId) => {
  const match = /^week-0*(\d+)$/.exec(moduleId || '');
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
  return {
    startLessons: byModule[START_MODULE_ID] || [],
    weekGroups: WEEK_ORDER.filter((moduleId) => byModule[moduleId]?.length)
      .map((moduleId) => ({ moduleId, week: weekLabel(moduleId), lessons: byModule[moduleId] })),
    labLessons: byModule[LAB_MODULE_ID] || [],
    additionalModuleGroups: Object.keys(byModule)
      .filter((moduleId) => !SPECIAL_MODULE_IDS.has(moduleId))
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
      .map((moduleId) => ({ moduleId, lessons: byModule[moduleId] })),
  };
};
