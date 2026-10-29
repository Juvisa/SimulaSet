# Preview local · Inbound — Primer contacto

Revisión visual de la modalidad **sin Supabase, sin red y sin guardar nada**.

```
npm run sandbox:primer-contacto
```

Abre `http://127.0.0.1:5199/` (o un escenario directo, por ejemplo
`http://127.0.0.1:5199/?escenario=cita-espera-coaching`).

- Monta la pantalla real del simulador (`src/pages/Simulator.jsx`) con la
  lógica real de Primer contacto; solo se sustituyen los cinco módulos que
  tocan red o datos (ver `vite.config.mjs`).
- La IA responde con guiones (`primer-contacto/scenarios.js`), incluidas dos
  reproducciones reales de la ronda 3 (R09 y R12).
- El panel inferior escribe el mensaje sugerido de cada turno, permite
  cambiar las demoras del prospecto y del coaching, y registra cada llamada
  simulada.
- La franja superior cuenta las conexiones externas bloqueadas (debe quedar
  en 0).
- No carga variables de entorno, solo escucha en 127.0.0.1 y no se puede
  compilar: no forma parte del build de producción.
