import type { TextStyle, ViewStyle } from 'react-native';
import { espaciado, radio, type Paleta } from '@/lib/tema';

/**
 * Fábricas de estilo compartidas entre pantallas.
 *
 * Cada función devuelve exactamente el bloque que antes estaba copiado en el
 * `estilos()` local de dos o más ficheros. Si dos «copias» difieren aunque sea
 * en un matiz (un margen, el peso de la fuente, el color de fondo), NO se
 * unifican aquí: cada pantalla se queda con la suya.
 *
 * Uso: `StyleSheet.create({ pantalla: fondoPantalla(c), ... })`, asignando a la
 * clave local que ya usa cada pantalla (así no hay renombrados ni colisiones).
 */

/** Fondo estándar de pantalla: a pantalla completa sobre `fondoSecundario`. */
export const fondoPantalla = (c: Paleta): ViewStyle => ({
  flex: 1,
  backgroundColor: c.fondoSecundario,
});

/** `contentContainerStyle` de las listas: aire alrededor y hueco entre filas. */
export const contenidoLista = (): ViewStyle => ({
  padding: espaciado.md,
  gap: espaciado.sm,
});

/** Input de texto de formulario (15 px sobre fondo secundario). */
export const campoTexto = (c: Paleta): TextStyle => ({
  borderWidth: 1,
  borderColor: c.borde,
  borderRadius: radio.md,
  paddingHorizontal: espaciado.md,
  paddingVertical: 10,
  fontSize: 15,
  color: c.texto,
  backgroundColor: c.fondoSecundario,
});

/** Fila de autocompletado de estaciones. */
export const sugerencia = (c: Paleta): TextStyle => ({
  fontSize: 14,
  color: c.primario,
  paddingVertical: 4,
  paddingHorizontal: 4,
});

/** Fila con asunto a la izquierda y detalle/acción a la derecha. */
export const filaEspaciada = (c: Paleta): ViewStyle => ({
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: espaciado.sm,
});

/** Fila con icono + título (cabecera de tarjeta). */
export const filaTitulo = (c: Paleta): ViewStyle => ({
  flexDirection: 'row',
  alignItems: 'center',
  gap: espaciado.sm,
});

/** Texto secundario de 13 px (datos bajo el título de cada tarjeta). */
export const meta = (c: Paleta): TextStyle => ({
  fontSize: 13,
  color: c.textoSecundario,
});

/** Pista o nota al usuario de 12 px. */
export const pista = (c: Paleta): TextStyle => ({
  fontSize: 12,
  color: c.textoSecundario,
});

/** Cuerpo de texto largo: 14 px con interlineado cómodo. */
export const cuerpo = (c: Paleta): TextStyle => ({
  fontSize: 14,
  color: c.textoSecundario,
  lineHeight: 20,
});

/** Título de tarjeta en negrita de 16 px. */
export const nombre = (c: Paleta): TextStyle => ({
  fontSize: 16,
  fontWeight: '700',
  color: c.texto,
});

/** Ídem, ocupando todo el ancho (filas con chip a la derecha). */
export const nombreFlex = (c: Paleta): TextStyle => ({
  ...nombre(c),
  flex: 1,
});

/** Título de pantalla: 22 px en negrita. */
export const tituloPantalla = (c: Paleta): TextStyle => ({
  fontSize: 22,
  fontWeight: '800',
  color: c.texto,
});

/** Contenedor del estado vacío (icono + título + texto). */
export const vacioContenedor = (c: Paleta): ViewStyle => ({
  alignItems: 'center',
  gap: espaciado.sm,
  paddingVertical: espaciado.xl,
});

/** Título en negrita del estado vacío (sin centrar: lo centra su contenedor). */
export const vacioTitulo = (c: Paleta): TextStyle => ({
  fontSize: 17,
  fontWeight: '700',
  color: c.texto,
});

/** Chip de selector de modo (estaciones/horarios, tema, orden…). */
export const chipModo = (c: Paleta): TextStyle => ({
  fontSize: 13,
  fontWeight: '600',
  color: c.textoSecundario,
  borderWidth: 1,
  borderColor: c.borde,
  borderRadius: radio.completo,
  paddingHorizontal: 12,
  paddingVertical: 6,
  overflow: 'hidden',
});

/** Chip de modo seleccionado. */
export const chipModoActivo = (c: Paleta): TextStyle => ({
  color: c.primarioOscuro,
  borderColor: c.primario,
  backgroundColor: c.acento,
});
