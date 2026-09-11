// Proyecto de demostración para validar el SET Value Builder sin depender de que
// el usuario ya tenga un proyecto real cargado. Mismo shape que fromDatabase() en
// src/utils/projects.js, para que el resto del flujo (generación IA) sea idéntico
// sin importar si el proyecto es real o de prueba.
export const MOCK_VALUE_BUILDER_PROJECT = {
  id: 'mock-elena-rios',
  isMock: true,
  name: 'Programa de Adherencia y Hábitos (Demo)',
  expertName: 'Dra. Elena Ríos',
  niche: 'Nutrición / Salud Femenina',
  promise: 'Programa de Adherencia y Hábitos de 12 semanas',
  price: '',
  avatarBusiness: '',
  avatarCurrentSituation: 'Ha probado varios planes alimenticios en el último año sin sostener ninguno más de unas semanas.',
  avatarPain: 'Abandono de dietas por frustración: empieza motivada, no ve resultados rápido, siente que el plan es insostenible en su día a día y termina dejándolo.',
  avatarDesire: 'Construir hábitos alimenticios que se mantengan en el tiempo, sin sentir que está "a dieta" para siempre.',
  avatarDescription: 'Mujeres de 30-45 años que ya intentaron múltiples dietas restrictivas sin éxito sostenido y buscan un cambio de hábitos real, no una dieta más.',
  commonObjections: 'No tengo tiempo para cocinar distinto para mí. Ya intenté varios programas y ninguno funcionó.',
};
