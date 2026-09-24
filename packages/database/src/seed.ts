import { getPrisma } from './index';

const ESTACIONES = [
  {
    id: 'es-mad-ato',
    codigo: 'es-mad-ato',
    nombre: 'Madrid-Atocha',
    ciudad: 'Madrid',
    latitud: 40.4069,
    longitud: -3.6895,
  },
  {
    id: 'es-mad-cham',
    codigo: 'es-mad-cham',
    nombre: 'Madrid-Chamartín',
    ciudad: 'Madrid',
    latitud: 40.4719,
    longitud: -3.6773,
  },
  {
    id: 'es-bcn-sants',
    codigo: 'es-bcn-sants',
    nombre: 'Barcelona-Sants',
    ciudad: 'Barcelona',
    latitud: 41.3793,
    longitud: 2.1403,
  },
  {
    id: 'es-sev-just',
    codigo: 'es-sev-just',
    nombre: 'Sevilla-Santa Justa',
    ciudad: 'Sevilla',
    latitud: 37.392,
    longitud: -5.9758,
  },
  {
    id: 'es-vlc-joa',
    codigo: 'es-vlc-joa',
    nombre: 'Valencia-Joaquín Sorolla',
    ciudad: 'Valencia',
    latitud: 39.4674,
    longitud: -0.3775,
  },
  {
    id: 'es-zaz-delicias',
    codigo: 'es-zaz-delicias',
    nombre: 'Zaragoza-Delicias',
    ciudad: 'Zaragoza',
    latitud: 41.6591,
    longitud: -0.9109,
  },
  {
    id: 'es-agp-mar',
    codigo: 'es-agp-mar',
    nombre: 'Málaga-María Zambrano',
    ciudad: 'Málaga',
    latitud: 36.7115,
    longitud: -4.4319,
  },
  {
    id: 'es-cod-cord',
    codigo: 'es-cod-cord',
    nombre: 'Córdoba',
    ciudad: 'Córdoba',
    latitud: 37.8884,
    longitud: -4.7886,
  },
  {
    id: 'es-bio-aha',
    codigo: 'es-bio-aha',
    nombre: 'Bilbao-Abando',
    ciudad: 'Bilbao',
    latitud: 43.2628,
    longitud: -2.9256,
  },
  {
    id: 'es-alc-tren',
    codigo: 'es-alc-tren',
    nombre: 'Alicante-Terminal',
    ciudad: 'Alicante',
    latitud: 38.3453,
    longitud: -0.4987,
  },
  {
    id: 'es-pmi-palma',
    codigo: 'es-pmi-palma',
    nombre: 'Palma',
    ciudad: 'Palma',
    latitud: 39.5714,
    longitud: 2.7367,
  },
  {
    id: 'es-vig-calat',
    codigo: 'es-vig-calat',
    nombre: 'Vigo-Puerto',
    ciudad: 'Vigo',
    latitud: 42.2376,
    longitud: -8.7237,
  },
];

async function main() {
  const prisma = getPrisma();
  for (const estacion of ESTACIONES) {
    await prisma.estacion.upsert({
      where: { codigo: estacion.codigo },
      update: estacion,
      create: estacion,
    });
  }
  console.log(`Seed completado: ${ESTACIONES.length} estaciones`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    const prisma = getPrisma();
    await prisma.$disconnect();
  });
