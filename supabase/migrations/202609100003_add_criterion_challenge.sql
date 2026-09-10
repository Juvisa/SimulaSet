-- Reto de Criterio S.E.T.: preguntas rápidas de opción múltiple / detección de
-- error, vinculadas directamente a la misión diaria del día (una por día, igual
-- que el resto del progreso). No requiere evaluación por IA (auto-calificado).
alter table public.daily_mission_progress
  add column if not exists criterion_answer text,
  add column if not exists criterion_correct boolean,
  add column if not exists criterion_completed_at timestamptz;
