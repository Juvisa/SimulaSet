// Drawer mobile del coaching: oculto, sale por completo de la pantalla y no
// tapa la barra de escritura (regresión de 5c1c7bf, todas las modalidades).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOBILE_DRAWER_BOTTOM_CLASS, MOBILE_DRAWER_HIDDEN_CLASS, MOBILE_DRAWER_OFFSET_REM } from './mobileDrawer';

const page = readFileSync(new URL('../pages/Simulator.jsx', import.meta.url), 'utf8');

describe('drawer mobile del coaching', () => {
  it('oculto baja su altura más el desplazamiento de su anclaje', () => {
    const bottomRem = Number(MOBILE_DRAWER_BOTTOM_CLASS.replace('bottom-', '')) * 0.25;
    expect(bottomRem).toBe(MOBILE_DRAWER_OFFSET_REM);
    expect(MOBILE_DRAWER_HIDDEN_CLASS).toBe(`translate-y-[calc(100%+${MOBILE_DRAWER_OFFSET_REM}rem)]`);
  });

  it('la pantalla usa las constantes, igual para todas las modalidades', () => {
    expect(page).toContain('fixed ${MOBILE_DRAWER_BOTTOM_CLASS} md:hidden');
    expect(page).toContain("${visible ? 'translate-y-0' : MOBILE_DRAWER_HIDDEN_CLASS}");
    // Ni la clase anterior ni una excepción por modalidad.
    expect(page).not.toContain("'translate-y-full'");
    expect(page).not.toMatch(/mode\s*===\s*['"A-Z_]+\s*\?\s*'translate-y/);
  });

  it('el drawer solo existe en móvil (md:hidden) y el panel de escritorio no cambia', () => {
    expect(page).toContain('<div className="hidden md:block w-80 flex-shrink-0">');
  });
});
