import { Dimensions, StyleSheet } from 'react-native';
import {
  campoTexto,
  chipModo,
  chipModoActivo,
  contenidoLista,
  filaEspaciada,
  fondoPantalla,
  meta,
  nombre,
  sugerencia,
  tituloPantalla,
} from '@/lib/estilos-comunes';
import { espaciado, type Paleta } from '@/lib/tema';

/** Tope del bloque «Salidas de X hoy»: así la lista de estaciones de debajo sigue viéndose. */
const MAX_ALTO_SALIDAS = Dimensions.get('window').height * 0.4;

/**
 * Estilos de la pantalla de trenes, compartidos por el orquestador y por las
 * cuatro vistas (cada una los calcula con su `useTema`, igual que antes).
 */
export const estilosTrenes = (c: Paleta) =>
  StyleSheet.create({
    pantalla: fondoPantalla(c),
    encabezado: {
      backgroundColor: c.fondo,
      padding: espaciado.md,
      gap: espaciado.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.borde,
    },
    titulo: tituloPantalla(c),
    modos: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: espaciado.sm,
    },
    modo: chipModo(c),
    modoActivo: chipModoActivo(c),
    mesFila: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaciado.sm,
    },
    mesFlecha: {
      fontSize: 24,
      fontWeight: '700',
      color: c.primario,
      paddingHorizontal: espaciado.md,
      paddingVertical: 2,
    },
    mesFlechaInactiva: {
      color: c.borde,
    },
    mesNombre: {
      fontSize: 15,
      fontWeight: '700',
      color: c.texto,
      textTransform: 'capitalize',
    },
    formulario: {
      gap: 6,
    },
    campo: campoTexto(c),
    sugerencia: sugerencia(c),
    lista: contenidoLista(),
    salidasScroll: {
      maxHeight: MAX_ALTO_SALIDAS,
    },
    ficha: {
      gap: espaciado.xs,
      paddingVertical: espaciado.sm,
      borderTopWidth: 1,
      borderTopColor: c.borde,
    },
    botonMapa: {
      minHeight: 40,
      paddingVertical: 8,
      paddingHorizontal: 12,
      alignSelf: 'flex-start',
    },
    aforos: {
      gap: 2,
      marginTop: espaciado.xs,
    },
    fila: filaEspaciada(c),
    nombre: nombre(c),
    meta: meta(c),
    indemnizacion: {
      fontSize: 13,
      fontWeight: '600',
      color: c.aviso,
    },
    vacio: {
      textAlign: 'center',
      color: c.textoSecundario,
      marginTop: espaciado.xl,
    },
    pieLista: {
      textAlign: 'center',
      color: c.textoSecundario,
      fontSize: 13,
      paddingVertical: espaciado.sm,
    },
  });
