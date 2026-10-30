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
- La barra superior tiene «Escribir sugerido» (escribe el mensaje del guion
  en el campo) y «Panel de prueba» para mostrar u ocultar el panel: en
  pantallas anchas va en una columna a la derecha y en pantallas angostas
  debajo del chat. Nunca tapa el chat ni el campo de escritura; oculto, no
  ocupa espacio. El panel permite cambiar las demoras del prospecto y del
  coaching y registra cada llamada simulada.
- La barra superior cuenta las conexiones externas bloqueadas (debe quedar
  en 0).
- No carga variables de entorno, solo escucha en 127.0.0.1 y no se puede
  compilar: no forma parte del build de producción.
