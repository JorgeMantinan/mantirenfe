export const colores = {
  primario: '#75258c',
  primarioOscuro: '#5c1d70',
  primarioClaro: '#9b4bb8',
  acento: '#f3e8f7',
  fondo: '#ffffff',
  fondoSecundario: '#f7f5f9',
  texto: '#1a1523',
  textoSecundario: '#6b6580',
  borde: '#e8e4ee',
  exito: '#16a34a',
  aviso: '#d97706',
  error: '#dc2626',
  superposicion: 'rgba(26, 21, 35, 0.45)',
};

export const coloresOscuros: typeof colores = {
  primario: '#ab5fce',
  primarioOscuro: '#c79ae6',
  primarioClaro: '#c98fe0',
  acento: '#3a2a4a',
  fondo: '#16121c',
  fondoSecundario: '#1e1927',
  texto: '#f4f1f8',
  textoSecundario: '#a79dbd',
  borde: '#2e2738',
  exito: '#22c55e',
  aviso: '#f59e0b',
  error: '#f87171',
  superposicion: 'rgba(0, 0, 0, 0.6)',
};

export type Paleta = typeof colores;

export const espaciado = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radio = {
  sm: 8,
  md: 12,
  lg: 16,
  completo: 999,
} as const;
