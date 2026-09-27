import { describe, expect, it } from 'vitest';
import { parsearAlertasGtfsRt, resumirTitulo } from './gtfs-rt-alertas';

/** Helpers para montar mensajes protobuf a mano (etiqueta + payload). */
function varint(valor: number): Buffer {
  const bytes: number[] = [];
  let v = valor;
  do {
    let byte = v % 128;
    v = Math.floor(v / 128);
    if (v > 0) byte |= 128;
    bytes.push(byte);
  } while (v > 0);
  return Buffer.from(bytes);
}

function etiqueta(numero: number, tipo: number): Buffer {
  return varint(numero * 8 + tipo);
}

function bloque(numero: number, contenido: Buffer): Buffer {
  return Buffer.concat([etiqueta(numero, 2), varint(contenido.length), contenido]);
}

function cadena(numero: number, texto: string): Buffer {
  return bloque(numero, Buffer.from(texto, 'utf8'));
}

function numero(numeroCampo: number, valor: number): Buffer {
  return Buffer.concat([etiqueta(numeroCampo, 0), varint(valor)]);
}

/** TranslatedString con una única traducción en español. */
function traducido(numeroCampo: number, texto: string): Buffer {
  const entrada = Buffer.concat([cadena(1, texto), cadena(2, 'es')]);
  return bloque(numeroCampo, bloque(1, entrada));
}

describe('parsearAlertasGtfsRt', () => {
  it('decodifica periodo, estaciones, causa/efecto y textos', () => {
    const alerta = Buffer.concat([
      bloque(1, Buffer.concat([numero(1, 1774611420), numero(2, 1774700000)])),
      bloque(5, cadena(5, '10007')),
      bloque(5, cadena(2, '10T0114C9')),
      numero(6, 9),
      numero(7, 3),
      traducido(10, 'Ascensor fuera de servicio'),
      traducido(11, 'El ascensor de Majadahonda está parado.'),
    ]);
    const feed = Buffer.concat([
      bloque(1, Buffer.concat([cadena(1, '2.0'), numero(3, 1790519602)])),
      bloque(2, Buffer.concat([cadena(1, 'INFO_1'), bloque(5, alerta)])),
    ]);

    const [incidencia] = parsearAlertasGtfsRt(feed);

    expect(incidencia?.id).toBe('INFO_1');
    expect(incidencia?.titulo).toBe('Ascensor fuera de servicio');
    expect(incidencia?.mensaje).toBe('El ascensor de Majadahonda está parado.');
    expect(incidencia?.causa).toBe('Mantenimiento · Retrasos significativos');
    expect(incidencia?.desde?.toISOString()).toBe(new Date(1774611420 * 1000).toISOString());
    expect(incidencia?.hasta?.toISOString()).toBe(new Date(1774700000 * 1000).toISOString());
    expect(incidencia?.stopIds).toEqual(['10007']);
    expect(incidencia?.routeIds).toEqual(['10T0114C9']);
  });

  it('acepta el alert en el campo 3 de la entidad (variante gtfs-realtime)', () => {
    const alerta = bloque(5, cadena(5, '19003'));
    const feed = Buffer.concat([
      bloque(2, Buffer.concat([cadena(1, 'INFO_2'), bloque(3, alerta)])),
    ]);

    const [incidencia] = parsearAlertasGtfsRt(feed);
    expect(incidencia?.id).toBe('INFO_2');
    expect(incidencia?.stopIds).toEqual(['19003']);
  });

  it('ignora las entidades borradas y salta los campos desconocidos', () => {
    const alertaBorrada = bloque(5, bloque(5, cadena(5, '10007')));
    const alertaViva = Buffer.concat([bloque(5, cadena(5, '10001')), numero(6, 9), numero(99, 7)]);
    const feed = Buffer.concat([
      bloque(2, Buffer.concat([cadena(1, 'BORRADA'), numero(2, 1), alertaBorrada])),
      bloque(2, Buffer.concat([cadena(1, 'VIVA'), bloque(5, alertaViva)])),
    ]);

    const alertas = parsearAlertasGtfsRt(feed);
    expect(alertas.map((a) => a.id)).toEqual(['VIVA']);
    expect(alertas[0]?.causa).toBe('Mantenimiento');
    expect(alertas[0]?.stopIds).toEqual(['10001']);
  });

  it('deja fuera las entidades cuyo contenido no se puede leer', () => {
    // informed_entity con bytes que no son un EntitySelector válido
    const alertaIlegible = bloque(5, Buffer.from('10007', 'utf8'));
    const feed = Buffer.concat([
      bloque(2, Buffer.concat([cadena(1, 'ROTO'), bloque(5, alertaIlegible)])),
      bloque(2, Buffer.concat([cadena(1, 'OK'), bloque(5, bloque(5, cadena(5, '10001')))])),
    ]);

    const alertas = parsearAlertasGtfsRt(feed);
    expect(alertas.map((a) => a.id)).toEqual(['OK']);
    expect(alertas[0]?.stopIds).toEqual(['10001']);
  });

  it('deja hasta a null cuando el periodo no tiene fin', () => {
    const alerta = bloque(1, numero(1, 1774611420));
    const feed = Buffer.concat([
      bloque(2, Buffer.concat([cadena(1, 'AVISO_1'), bloque(5, alerta)])),
    ]);

    const [incidencia] = parsearAlertasGtfsRt(feed);
    expect(incidencia?.desde).toEqual(new Date(1774611420 * 1000));
    expect(incidencia?.hasta).toBeNull();
  });

  it('devuelve una lista vacía para un feed sin entidades', () => {
    const feed = bloque(1, Buffer.concat([cadena(1, '2.0'), numero(3, 1790519602)]));
    expect(parsearAlertasGtfsRt(feed)).toEqual([]);
  });

  it('lanza si el buffer está truncado (no confiamos en feeds corruptos)', () => {
    const feed = bloque(2, Buffer.concat([cadena(1, 'INFO_9'), bloque(5, cadena(5, '10007'))]));
    expect(() => parsearAlertasGtfsRt(feed.subarray(0, feed.length - 3))).toThrow(
      'GTFS_RT_PROTO_TRUNCADO',
    );
  });
});

describe('resumirTitulo', () => {
  it('se queda con la primera frase y sin el hashtag inicial', () => {
    const texto = '#MadC9 Por obras se suspende el servicio. Se establece autobús alternativo.';
    expect(resumirTitulo(texto)).toBe('Por obras se suspende el servicio');
  });

  it('corta a 90 caracteres si el mensaje no tiene punto', () => {
    expect(resumirTitulo('x'.repeat(120))).toHaveLength(90);
  });

  it('devuelve null sin mensaje', () => {
    expect(resumirTitulo(null)).toBeNull();
    expect(resumirTitulo('   ')).toBeNull();
  });
});
