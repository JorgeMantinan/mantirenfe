export type TemaDom = 'claro' | 'oscuro' | 'sistema';
export type TemaNext = 'light' | 'dark' | 'system';

const A_NEXT: Record<TemaDom, TemaNext> = {
  claro: 'light',
  oscuro: 'dark',
  sistema: 'system',
};

const A_DOM: Record<string, TemaDom> = {
  light: 'claro',
  dark: 'oscuro',
  system: 'sistema',
  claro: 'claro',
  oscuro: 'oscuro',
  sistema: 'sistema',
};

export function aNextTheme(tema: TemaDom | string | null | undefined): TemaNext {
  return A_NEXT[tema as TemaDom] ?? 'system';
}

export function deNextTheme(tema: string | null | undefined): TemaDom {
  return A_DOM[tema ?? ''] ?? 'sistema';
}

export function esTemaNext(tema: string | null | undefined): tema is TemaNext {
  return tema === 'light' || tema === 'dark' || tema === 'system';
}

let ultimaEdicion = 0;

export function marcarEdicionTema(): void {
  ultimaEdicion = Date.now();
}

export function edicionTemaReciente(ventanaMs = 8000): boolean {
  return Date.now() - ultimaEdicion < ventanaMs;
}
