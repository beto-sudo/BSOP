/**
 * Objetos de obra más comunes (frentes reales de DILESA). Al elegir uno se
 * pre-llena el campo `objeto` del contrato de obra (editable, p.ej. para
 * agregar metros lineales); es la cláusula PRIMERA del contrato y el texto
 * que usa el PDF de obra de monto global (Fase 4).
 *
 * Compartido entre el alta (`app/dilesa/construccion/contratos/nuevo-obra`) y
 * la edición (`app/dilesa/construccion/contratos/[id]`). Vive en un `.ts` plano
 * (no en el page client) para no arrastrar el árbol de la página al importarlo
 * desde otro componente. Iniciativa dilesa-contratos-obra.
 */
export const OBJETOS_COMUNES = [
  'Construcción de muro de contención',
  'Construcción de barda perimetral',
  'Electrificación de lotes (media y baja tensión y alumbrado público)',
  'Electrificación de línea troncal',
  'Pavimentación',
  'Instalación de red de agua potable',
  'Instalación de red de drenaje sanitario',
  'Construcción de cordón y guarnición',
  'Construcción de banquetas',
  'Construcción de caseta de acceso',
  'Suministro e instalación de portón y control de acceso',
  'Fabricación e instalación de monolito y nomenclatura',
  'Terracerías y movimiento de tierras',
] as const;
