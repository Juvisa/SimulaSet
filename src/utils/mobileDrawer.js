// Drawer mobile del coaching del simulador (Simulator.jsx). Va anclado por
// encima de la barra de escritura (bottom-24 = 6rem) y, oculto, tiene que
// bajar su altura MÁS ese desplazamiento para salir de la pantalla. Con
// translate-y-full (desde 5c1c7bf) solo bajaba su altura: su borde superior
// quedaba encima de la barra de escritura (z-40 sobre z-35) y el campo dejaba
// de recibir toques en cuanto llegaba el primer coaching.
export const MOBILE_DRAWER_OFFSET_REM = 6;
export const MOBILE_DRAWER_BOTTOM_CLASS = 'bottom-24'; // 24 × 0,25rem = 6rem
export const MOBILE_DRAWER_HIDDEN_CLASS = 'translate-y-[calc(100%+6rem)]';
