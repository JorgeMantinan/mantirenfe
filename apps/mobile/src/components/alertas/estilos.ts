import { StyleSheet } from 'react-native';
import { contenidoLista, meta, nombreFlex, pista } from '@/lib/estilos-comunes';
import { espaciado, radio, type Paleta } from '@/lib/tema';

/**
 * Estilos de las dos pantallas de alertas, compartidos por los orquestadores
 * (`src/app/alertas/*`) y por las secciones extraídas en `src/components/alertas`:
 * cada uno los calcula con su `useTema`, igual que en la pantalla de trenes.
 */
export const estilosNueva = (c: Paleta) =>
  StyleSheet.create({
    pantalla: {
      flex: 1,
      backgroundColor: c.fondo,
    },
    contenido: {
      padding: espaciado.lg,
      gap: espaciado.sm,
      paddingBottom: espaciado.xl * 2,
    },
    titulo: {
      fontSize: 24,
      fontWeight: '800',
      color: c.texto,
    },
    subtitulo: {
      fontSize: 14,
      color: c.textoSecundario,
      marginBottom: espaciado.sm,
    },
    etiqueta: {
      fontSize: 14,
      fontWeight: '600',
      color: c.texto,
      marginTop: espaciado.sm,
    },
    campo: {
      borderWidth: 1,
      borderColor: c.borde,
      borderRadius: radio.md,
      paddingHorizontal: espaciado.md,
      paddingVertical: 12,
      fontSize: 16,
      color: c.texto,
      backgroundColor: c.fondo,
    },
    notas: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    cajaVuelta: {
      borderWidth: 1,
      borderColor: c.borde,
      borderRadius: radio.md,
      backgroundColor: c.fondoSecundario,
      padding: espaciado.md,
      gap: 6,
      marginTop: espaciado.sm,
    },
    cajaVueltaFila: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaciado.sm,
    },
    cajaVueltaTitulo: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: c.texto,
    },
    pista: pista(c),
    resumenTitulo: {
      fontSize: 12,
      fontWeight: '700',
      color: c.primario,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    resumenRuta: {
      fontSize: 15,
      fontWeight: '700',
      color: c.texto,
    },
    sugerencia: {
      fontSize: 14,
      color: c.primario,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: espaciado.sm,
    },
    chip: {
      borderWidth: 1,
      borderColor: c.borde,
      borderRadius: radio.completo,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: c.textoSecundario,
      backgroundColor: c.fondoSecundario,
      overflow: 'hidden',
    },
    chipActivo: {
      borderColor: c.primario,
      backgroundColor: c.acento,
      color: c.primarioOscuro,
      fontWeight: '700',
    },
  });

export const estilosDetalle = (c: Paleta) =>
  StyleSheet.create({
    lista: contenidoLista(),
    fila: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: espaciado.sm,
    },
    ruta: nombreFlex(c),
    etiquetas: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: espaciado.xs,
      justifyContent: 'flex-end',
      maxWidth: '55%',
    },
    detalle: meta(c),
    subtitulo: {
      fontSize: 13,
      fontWeight: '700',
      color: c.primario,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: espaciado.xs,
    },
    notiTitulo: {
      fontSize: 15,
      fontWeight: '700',
      color: c.texto,
      flex: 1,
    },
    plazaInfo: {
      flex: 1,
      gap: 2,
    },
    plazaTren: {
      fontSize: 15,
      fontWeight: '700',
      color: c.texto,
    },
    precio: {
      fontSize: 13,
      fontWeight: '600',
      color: c.aviso,
    },
    noPara: {
      fontSize: 13,
      fontWeight: '600',
      color: c.aviso,
    },
    fecha: pista(c),
    grupo: {
      gap: espaciado.xs,
      backgroundColor: c.fondoSecundario,
      borderWidth: 1,
      borderColor: c.borde,
      borderRadius: radio.sm,
      padding: espaciado.sm,
    },
    grupoEtiquetas: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: espaciado.xs,
    },
    acciones: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: espaciado.sm,
    },
    compartir: {
      alignSelf: 'flex-start',
      minHeight: 40,
      paddingVertical: espaciado.sm,
      paddingHorizontal: espaciado.md - 4,
    },
    vacio: {
      fontSize: 14,
      color: c.textoSecundario,
      textAlign: 'center',
      paddingVertical: espaciado.lg,
    },
    serie: {
      gap: espaciado.xs,
    },
    serieCabecera: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: espaciado.sm,
    },
    barraFila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaciado.sm,
    },
    barra: {
      flex: 1,
      height: 10,
      borderRadius: 5,
      backgroundColor: c.acento,
      overflow: 'hidden',
    },
    barraRelleno: {
      height: '100%',
      borderRadius: 5,
      backgroundColor: c.primario,
    },
    puntoFinal: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    barraPrecio: {
      width: 62,
      textAlign: 'right',
      fontSize: 11,
      color: c.textoSecundario,
    },
    multiplicador: {
      width: 32,
      textAlign: 'right',
      fontSize: 11,
      fontWeight: '600',
      color: c.textoSecundario,
    },
    resumen: {
      fontSize: 11,
      color: c.textoSecundario,
    },
    consejo: {
      fontSize: 12,
      fontWeight: '600',
      color: c.aviso,
    },
  });
