export interface EnlaceAfiliacion {
  id: 'trainline' | 'omio' | 'travelpayouts';
  nombre: string;
  url: string;
}

interface Candidato {
  id: EnlaceAfiliacion['id'];
  nombre: string;
  url: string | undefined;
}

const CANDIDATOS: Candidato[] = [
  { id: 'trainline', nombre: 'Trainline', url: import.meta.env.VITE_AFF_TRAINLINE_URL },
  { id: 'omio', nombre: 'Omio', url: import.meta.env.VITE_AFF_OMIO_URL },
  {
    id: 'travelpayouts',
    nombre: 'Travelpayouts',
    url: import.meta.env.VITE_AFF_TRAVELPAYOUTS_URL,
  },
];

function limpia(valor: string | undefined): string {
  return (valor ?? '').trim();
}

export const enlaces: EnlaceAfiliacion[] = CANDIDATOS.filter((c) => limpia(c.url) !== '').map(
  (c) => ({ id: c.id, nombre: c.nombre, url: limpia(c.url) }),
);

export const hayAfiliacion = enlaces.length > 0;

export const urlDonaciones = limpia(import.meta.env.VITE_DONACIONES_URL);

export const hayDonaciones = urlDonaciones !== '';
