import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function PaginaNoEncontrada() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="font-heading text-6xl font-bold text-primary">404</p>
      <h1 className="font-heading text-2xl font-semibold">Estación no encontrada</h1>
      <p className="max-w-md text-muted-foreground">
        La página que buscas no existe o ha cambiado de andén.
      </p>
      <Button asChild>
        <Link to="/">Volver al inicio</Link>
      </Button>
    </div>
  );
}
