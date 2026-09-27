import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from './Logo';

export function PaginaLegal({
  titulo,
  entradilla,
  children,
}: {
  titulo: string;
  entradilla: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft aria-hidden="true" /> Volver al inicio
            </Link>
          </Button>
        </div>
      </header>

      <main className="container max-w-3xl space-y-8 py-12">
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight">{titulo}</h1>
          <p className="text-muted-foreground">{entradilla}</p>
        </div>
        {children}
      </main>

      <footer className="border-t bg-muted/30 py-6">
        <div className="container flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Inicio
          </Link>
          <Link to="/transparencia" className="hover:text-foreground">
            Transparencia
          </Link>
          <Link to="/cookies" className="hover:text-foreground">
            Cookies
          </Link>
          <span>© 2026 MantiRenfe</span>
        </div>
      </footer>
    </div>
  );
}
