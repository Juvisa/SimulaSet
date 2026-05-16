import { getFollowUps, saveFollowUp } from './followUps';

export function verificarSeguimientosPendientes(setterId) {
  const ahora = new Date();
  const hoy = ahora.toDateString();
  const en7dias = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);

  const seguimientos = getFollowUps(setterId);

  const actualizados = seguimientos.map(s => {
    if (s.estado !== 'pendiente') return s;
    const programado = new Date(s.programado_para);
    if (programado <= ahora) {
      const updated = { ...s, estado: 'vencido', vencido_notificado: true };
      saveFollowUp(updated);
      return updated;
    }
    return s;
  });

  return {
    vencidos: actualizados.filter(s => s.estado === 'vencido'),
    hoy: actualizados.filter(s => {
      if (s.estado !== 'pendiente') return false;
      const f = new Date(s.programado_para);
      return f > ahora && f.toDateString() === hoy;
    }),
    proximos: actualizados.filter(s => {
      if (s.estado !== 'pendiente') return false;
      const f = new Date(s.programado_para);
      return f > ahora && f <= en7dias && f.toDateString() !== hoy;
    }),
    total_activos: actualizados.filter(s => ['pendiente', 'vencido'].includes(s.estado)).length,
  };
}
