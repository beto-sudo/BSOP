/**
 * Cédula de Características Generales, Materiales y Acabados de la
 * Vivienda — Anexo 3 del Contrato de Promesa de Compraventa.
 *
 * Hoy todos los prototipos DILESA usan los mismos 27 ítems. Por eso
 * vive aquí como módulo TS. Cuando agregues prototypes diferentes, el
 * camino correcto es:
 *
 *   1. Migración: `dilesa.productos.cedula_materiales jsonb`
 *   2. Backfill: clonar este array a todos los productos existentes.
 *   3. Form de admin para editar la cédula por producto.
 *   4. El template lee `producto.cedula_materiales`; este archivo
 *      queda como fallback inicial.
 *
 * Estructura tomada del export de Coda existente (DOC: DILESA · Promesa
 * de Compraventa).
 */

export type ItemMaterial = {
  clave: number;
  descripcion: string;
  marca: string;
  etapa: string;
  norma: string;
  colocacion: string;
  recomendacion: string;
};

export const CEDULA_MATERIALES_DEFAULT: ItemMaterial[] = [
  {
    clave: 1,
    descripcion: 'Tubería hidráulica 1/2" CPVC Ced. 40',
    marca: 'Cresco',
    etapa: 'Hidráulica',
    norma: 'NMX-E-181 CNCP-2006',
    colocacion:
      'Revise el tubo / accesorio buscando que esté libre de daños o fisuras. Limpie el tubo con un trapo seco y realice un corte perpendicular sin dejar rebaba en las caras del tubo utilizando tijeras corta tubos plásticos o segueta. En caso de tener un tubo dañado realice un corte de 5 cm antes de la región dañada. Si la tubería está sucia, utilice un limpiador. Pruebe en seco el accesorio en el tubo que debe entrar hasta 2/3 con dificultad. Utilizando cemento de resina de CPVC, con el aplicador del tarro, impregne de cemento la superficie externa del tubo, en un área que cubra la profundidad de la conexión. Sin volver a empapar el aplicador impregne sin exceso de cemento la parte interna de la conexión hasta el tope interior. Inserte el tubo en la conexión mientras va girando un cuarto de vuelta hasta el tope del accesorio. Sostenga la unión durante 10 - 30 segundos, verificando que se forme un anillo de cemento de CPVC en el exterior de la unión del tubo y la conexión. Si el anillo no se forma, corte la conexión y repita el proceso. Finalmente, si existe exceso de cemento retírelo de inmediato con un trapo.',
    recomendacion:
      'Siga correctamente los procedimientos de manejo de los materiales. Use herramientas apropiadas para el uso con tubería y conexiones de CPVC. Use el cemento correcto y siga las instrucciones para la aplicación. Corte los extremos del tubo perpendicularmente. Quitar la rebaba y biselar el tubo antes de pegar. No utilice aceites comestibles como lubricante. No utilice cementos que estén caducados, decolorados o gelatinosos. No utilice cementos cerca de una fuente de calor, fuego o mientras está fumando. No realice la prueba de presión antes de que transcurra el tiempo de curado recomendado. No utilice herramientas de corte sin filo o rotas al cortar el tubo.',
  },
  {
    clave: 2,
    descripcion: 'Conexiones hidráulicas 1/2" CPVC Ced. 40 (tee, codo 90°, codo 45°, cople, etc.)',
    marca: 'Cresco',
    etapa: 'Hidráulica',
    norma: 'NMX-E-181 CNCP-2006',
    colocacion: 'Mismo procedimiento de unión solvente que para la tubería CPVC (ver ítem 1).',
    recomendacion: 'Mismas recomendaciones que para la tubería CPVC (ver ítem 1).',
  },
  {
    clave: 3,
    descripcion: 'Tubería Sanitaria PVC 4"',
    marca: 'Cresco',
    etapa: 'Sanitaria',
    norma: 'NMX-E-181 CNCP-2006',
    colocacion:
      'Mismo procedimiento de unión solvente que CPVC, utilizando cemento de resina de PVC para sanitaria. Ver ítem 1 para el detalle paso a paso.',
    recomendacion: 'Mismas recomendaciones aplicables al PVC sanitario (ver ítem 1).',
  },
  {
    clave: 4,
    descripcion: 'Conexiones sanitarias PVC 4" (tee, codo 90°, codo 45°, cople, etc.)',
    marca: 'Cresco',
    etapa: 'Sanitaria',
    norma: 'NMX-E-181 CNCP-2006',
    colocacion: 'Mismo procedimiento de unión solvente PVC sanitario (ver ítem 3).',
    recomendacion: 'Mismas recomendaciones que para conexiones PVC (ver ítem 1).',
  },
  {
    clave: 5,
    descripcion: 'Cable eléctrico Cal. 10, 12 y 14',
    marca: 'Argos',
    etapa: 'Eléctrica',
    norma: 'NOM-063-SCFI-2000, NOM-001-SEDE-2005, NMX-J-010-ANCE-2005, NMX-J-012-ANCE-2005',
    colocacion:
      'Los conductores de cada circuito independiente parten de su correspondiente PIA en el cuadro eléctrico y recorren la vivienda alojados en el interior por manguera tipo poliducto empotrados en la pared. A lo largo del recorrido, la alimentación de cada receptor (puntos de luz y tomas de corriente) se realiza por derivación de los conductores principales del circuito independiente, en cajas de registro donde se realizan conexiones y empalmes de los cables eléctricos.',
    recomendacion: 'Aislar bien las conexiones para evitar accidentes.',
  },
  {
    clave: 6,
    descripcion: 'Piso Cerámico (según proyecto)',
    marca: '—',
    etapa: 'Acabados',
    norma: 'NOM-231-SSA1-2002',
    colocacion:
      'Aplique el pegamento sobre la superficie plana, firme, nivelada y limpia. Coloque el pegamento con una llana dentada dejando una junta mínima de 2 mm.',
    recomendacion:
      'Los contrapisos deben tener un mínimo de 3 días de secado. Antes de la colocación limpiar las juntas entre piezas — cualquier agente presente puede restar efectividad a la adherencia del porcelanato. Después de la instalación y de sellar las juntas es obligatorio remover la cera protectora, aplicando cemento blanco o con los mismos residuos del pego. No utilizar esponjas de alambre.',
  },
  {
    clave: 7,
    descripcion: 'Loseta Cerámica (según proyecto)',
    marca: '—',
    etapa: 'Acabados',
    norma: 'NOM-231-SSA1-2002',
    colocacion: 'Mismo procedimiento que el Piso Cerámico (ver ítem 6).',
    recomendacion: 'Mismas recomendaciones que el Piso Cerámico (ver ítem 6).',
  },
  {
    clave: 8,
    descripcion: 'Piso antiderrapante (según proyecto)',
    marca: '—',
    etapa: 'Acabados',
    norma: 'NOM-231-SSA1-2002',
    colocacion: 'Mismo procedimiento que el Piso Cerámico (ver ítem 6).',
    recomendacion: 'Mismas recomendaciones que el Piso Cerámico (ver ítem 6).',
  },
  {
    clave: 9,
    descripcion: 'Concreto Escobillado y/o Floteado — Cemento',
    marca: 'Monterrey',
    etapa: 'Acabados',
    norma: 'NMX-C-061, NMX-C-059, NMX-C-062',
    colocacion:
      'Este cemento puede utilizarse en la construcción de todo tipo de elementos o estructuras de concreto simple o armado. Es compatible con todos los materiales de construcción convencionales logrando excelentes resultados en la construcción tradicional de pisos, firmes, castillos, trabes, zapatas, losas, columnas, etc.',
    recomendacion:
      'No use la unidad para transportar otros productos diferentes al cemento; en su caso, elimine los residuos del material extraño antes de la carga del cemento. Antes de la carga asegúrese de que el interior de la tolva se encuentra limpio y seco. Después de la carga asegúrese de que las tapas de la tolva cierren herméticamente; mantenga el interior limpio y libre de adherencias. Incluya la limpieza del interior de la tolva y su hermeticidad en los programas de mantenimiento de la unidad.',
  },
  {
    clave: 10,
    descripcion: 'Adhesivo Blanco Premier Antideslizamiento',
    marca: 'Interceramic',
    etapa: 'Generales',
    norma: 'ANSI A 118.1',
    colocacion:
      'Instale conforme a la norma ANSI A108.5. Utilice una llana de tamaño apropiado para asegurar un 100% de cobertura. Extienda la pasta en la superficie utilizando el lado plano de la llana, con una inclinación de 30 a 40 grados; asegúrese que el adhesivo penetre en las irregularidades de la superficie para lograr una máxima adhesión. Enseguida distribúyala con el lado dentado, utilizando una llana de diente cuadrado y extendiendo el adhesivo en sentido horizontal o vertical. Coloque las losetas sobre el adhesivo y presione con firmeza, ajústela con movimientos perpendiculares al rayado del adhesivo.',
    recomendacion:
      'USOS: instalar loseta cerámica de baja o alta absorción de agua (con o sin esmalte), mosaico, azulejo, talavera, laja, granito, cantera, mármol claro, conchuela o productos similares sobre concreto sin pulir, enjarre, mortero, tablero cemento ASTM C1325 o ANSI 118.9 y tableros de yeso ASTM 1396/C1396M. LIMITACIONES: no utilizar para mármol verde o negro. No instalar sobre cerámica. Vida útil de la mezcla: 2 horas.',
  },
  {
    clave: 11,
    descripcion: 'Adhesivo Gris Piso',
    marca: 'Interceramic',
    etapa: 'Generales',
    norma: 'ANSI A 118.1',
    colocacion: 'Mismo procedimiento que el Adhesivo Blanco Premier (ver ítem 10).',
    recomendacion:
      'USOS: loseta cerámica de baja absorción de agua. LIMITACIONES: no usar para mármol verde o negro; no aplicar sobre cerámica. Vida útil de la mezcla: 2 horas.',
  },
  {
    clave: 12,
    descripcion: 'Pegazulejo',
    marca: 'Interceramic',
    etapa: 'Generales',
    norma: 'ANSI A 118.1',
    colocacion: 'Mismo procedimiento que los adhesivos cerámicos (ver ítem 10).',
    recomendacion:
      'USOS: loseta de alta absorción de agua hasta formatos de 33×33 cm. LIMITACIONES: no usar para mármol verde o negro; no aplicar sobre cerámica. Vida útil de la mezcla: 2 horas.',
  },
  {
    clave: 13,
    descripcion: 'Boquilla sin Arena',
    marca: 'Interceramic',
    etapa: 'Generales',
    norma: 'ANSI A 118.6',
    colocacion:
      'Limpie y humedezca el área a emboquillar. Utilizando una llana de hule rígido, extienda la boquilla en forma diagonal a las líneas de las juntas, fórjela entre las mismas. Retire el exceso de boquilla de la superficie. Espere de 5 a 10 minutos hasta que la boquilla adquiera firmeza en las juntas; enseguida limpie con una esponja exprimida haciendo presión suave y con movimientos circulares.',
    recomendacion:
      'USOS: boquilla para interiores y exteriores, espesores de unión menores a 3 mm en loseta cerámica, porcelana, mármol y materiales similares. LIMITACIONES: no usar a temperaturas menores de 15 °C; no aplicar sobre juntas de expansión.',
  },
  {
    clave: 14,
    descripcion: 'Yeso Máximo',
    marca: 'Yesera Monterrey',
    etapa: 'Generales',
    norma: 'NOM-018',
    colocacion:
      'En una batea limpia, libre de residuo de yeso fraguado, agregue agua limpia de acuerdo a las especificaciones, vacíe uniformemente y espolvoree en la batea la cantidad de yeso requerida de acuerdo con la cantidad de agua agregada. Antes de aplicar el yeso verifique que la superficie esté libre de impurezas, aceites, grasas, sales solubles, salitre y trasminación de agua al exterior. Utilice reglas o espátulas para plomear y aplanar el acabado; deben estar limpias y libres de yeso fraguado.',
    recomendacion:
      'El uso de agua en exceso alarga el tiempo de fraguado y da un acabado blando; la falta de agua lo reduce y da un acabado áspero. En losas debe estar preferentemente impermeabilizado antes de aplicar el yeso.',
  },
  {
    clave: 15,
    descripcion: 'Stucco',
    marca: 'Uniblock',
    etapa: 'Generales',
    norma: 'NOM-018-ENER',
    colocacion:
      'Moje o selle la superficie. Con una llana metálica cuadrada aplique el recubrimiento UNIBLOCK STUCCO con movimientos de abajo hacia arriba y de derecha a izquierda formando una cruz. Para dar acabado espere 20 minutos y utilice una llana de esponja con movimientos circulares para obtener el acabado flotado. Durante las próximas 72 h humedezca la superficie en la mañana y noche.',
    recomendacion:
      'USOS: block, barro block, concreto celular y mortero base cemento-arena. Para uso interior y exterior. Repelente a la humedad. LIMITACIONES: no aplicar sobre paredes recubiertas de pintura ni sobre yeso, paneles con flexión o superficies metálicas/vibraciones extremas.',
  },
  {
    clave: 16,
    descripcion: 'Aislante Térmico SPRAYFFEL 1506',
    marca: '—',
    etapa: 'Generales',
    norma: 'NOM-018-ENER-2011',
    colocacion:
      'Aplicar sobre sustrato limpio (sin grasa, polvo ni residuos). Resanar puntos críticos: chaflanes, domos, tubería que atraviese la losa, fisuras mayores, uniones de losa, juntas constructivas.',
    recomendacion:
      'Evita filtraciones, goteras y humedad; rechaza frío, calor y ruido por sus propiedades térmico-acústicas.',
  },
  {
    clave: 17,
    descripcion: 'Pintura Vinílica',
    marca: 'Berel',
    etapa: 'Generales',
    norma: 'NMX-U-116-SCFI-2018',
    colocacion:
      'Aplicar en el interior y exterior de la fachada principal hasta cubrir la superficie (mínimo dos manos), sobre muros previamente sellados con sellador vinílico, resanados y limpios de polvo e impurezas.',
    recomendacion:
      'No diluir en exceso ni extender más de la cuenta — se modifican propiedades y rendimiento. Calcular el área de pintado y la cantidad necesaria, considerando textura, porosidad y herramienta (brocha, rodillo o pistola).',
  },
  {
    clave: 18,
    descripcion: 'Puerta principal 0.90 × 2.03 m, acero de poliestireno color chocolate',
    marca: '—',
    etapa: 'Herrería y Carpintería',
    norma: 'NMX-R-060-SCFI-2013',
    colocacion:
      'Dejar espacio de 3 mm a cada lado entre marco y puerta. Recomendable un rebaje inclinado (desveine) hacia adentro para mejor ajuste y espacio para las bisagras. Marcar la posición de las bisagras y rebajar; profundidad igual al espesor del cuerpo de la bisagra. Una vez instaladas, colocar la puerta usando cuñas; marcar y calar las bisagras finales.',
    recomendacion:
      'No alterar la estructura de la puerta. Instalar la cerradura al momento de colgar. Las puertas de uso exterior son resistentes a la humedad ambiental.',
  },
  {
    clave: 19,
    descripcion: 'Puerta de Recámara 0.80 × 2.03 m, tambor color chocolate',
    marca: '—',
    etapa: 'Herrería y Carpintería',
    norma: 'NMX-R-060-SCFI-2013',
    colocacion: 'Mismo procedimiento de instalación que la Puerta principal (ver ítem 18).',
    recomendacion: 'Mismas recomendaciones que la Puerta principal (ver ítem 18).',
  },
  {
    clave: 20,
    descripcion: 'Puerta de Baño 0.70 × 2.03 m, tambor color chocolate',
    marca: '—',
    etapa: 'Herrería y Carpintería',
    norma: 'NMX-R-060-SCFI-2013',
    colocacion: 'Mismo procedimiento de instalación que la Puerta principal (ver ítem 18).',
    recomendacion: 'Mismas recomendaciones que la Puerta principal (ver ítem 18).',
  },
  {
    clave: 21,
    descripcion: 'Puerta corrediza de aluminio color hueso 2", cristal claro 6 mm',
    marca: '—',
    etapa: 'Herrería y Carpintería',
    norma: 'NMX-R-060-SCFI-2013',
    colocacion:
      'La ventana llevará garras para su fijación: al menos dos por largo, abiertas antes de su colocación. Mínimo dos garras separadas a no más de 50 cm entre sí; un punto de anclaje como máximo a 25 cm de cada esquina del premarco. Verificar el hueco limpio de yeso y otros materiales, a nivel y con medidas constantes.',
    recomendacion: 'Verificar correcta operación de los herrajes después de la colocación.',
  },
  {
    clave: 22,
    descripcion: 'Puerta de servicio 1.75 × 2.70 m, fabricada con PTR 1 1/2" × 1 y 2 × 1"',
    marca: '—',
    etapa: 'Herrería y Carpintería',
    norma: 'NMX-R-060-SCFI-2013',
    colocacion: 'Mismo procedimiento de instalación que la Puerta principal (ver ítem 18).',
    recomendacion: 'Mismas recomendaciones que la Puerta principal (ver ítem 18).',
  },
  {
    clave: 23,
    descripcion: 'Ventanas corredizas y fijos de aluminio color chocolate 1 1/2", cristal 3 mm',
    marca: '—',
    etapa: 'Herrería y Carpintería',
    norma: 'NMX-R-060-SCFI-2013, ASTM C 1363-2011',
    colocacion: 'Mismo procedimiento que la Puerta corrediza de aluminio (ver ítem 21).',
    recomendacion:
      'No retirar las hojas para colocar las ventanas, salvo en casos de envergadura grande (peso/maniobrabilidad). Asegurar que al colocarlas de nuevo queden en la posición adecuada y los herrajes funcionen correctamente.',
  },
  {
    clave: 24,
    descripcion: 'Sanitario Mónaco SA8238-I-0 color blanco, descarga 4.8 L',
    marca: 'Interceramic',
    etapa: 'Baños y Accesorios',
    norma: 'NOM-009-CNA-2001',
    colocacion: 'Instalación estándar del inodoro en el baño.',
    recomendacion:
      'Limpiar con agua y paño suave. Evitar limpiadores en polvo, químicos o paños ásperos. No utilizar ácidos — causan corrosión. Se recomienda jabón líquido sin alcohol; lavar, enjuagar y secar perfectamente.',
  },
  {
    clave: 25,
    descripcion: 'Lavabo para manos LUCCA MB-LAVP12038C0',
    marca: 'Interceramic',
    etapa: 'Baños y Accesorios',
    norma: 'NOM-009-CNA-2001',
    colocacion: 'Instalación estándar del lavabo en el baño.',
    recomendacion: 'Mismas recomendaciones de limpieza que el Sanitario (ver ítem 24).',
  },
  {
    clave: 26,
    descripcion: 'Mezcladora monomando para empotrar 34-MC para regadera',
    marca: 'Rugo',
    etapa: 'Baños y Accesorios',
    norma: 'NOM-009-CNA-2001',
    colocacion: 'Instalación estándar de la mezcladora en la regadera.',
    recomendacion: 'Mismas recomendaciones de limpieza que el Sanitario (ver ítem 24).',
  },
  {
    clave: 27,
    descripcion: 'Regadera metálica cromo modelo SH458M',
    marca: 'AMG',
    etapa: 'Baños y Accesorios',
    norma: 'NMX-R-060-SCFI-2013, ASTM C 1363-2011, NOM-008-CONAGUA-1998',
    colocacion: 'Instalación estándar de regadera en baño.',
    recomendacion: 'Mismas recomendaciones de limpieza que el Sanitario (ver ítem 24).',
  },
];
