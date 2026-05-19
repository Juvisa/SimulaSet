const MIGRATED_KEY = 'simulaset_migrated_v2';

export function migrarDatosExistentes() {
  if (localStorage.getItem(MIGRATED_KEY)) return;

  const claves = [
    { key: 'simulaset_projects', idField: 'userId' },
    { key: 'simulaset_sessions', idField: 'userId' },
    { key: 'real_leads_sessions', idField: 'setter_id' },
    { key: 'follow_up_schedule', idField: 'setter_id' },
  ];

  claves.forEach(({ key, idField }) => {
    try {
      const datos = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(datos) || datos.length === 0) return;
      const migrados = datos.map(item => ({
        ...item,
        setter_id: item.setter_id || item.userId || 'admin',
      }));
      localStorage.setItem(key, JSON.stringify(migrados));
    } catch {}
  });

  localStorage.setItem(MIGRATED_KEY, '1');
}
