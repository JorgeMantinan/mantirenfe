import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { i18n } from '@/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Captura los errores de render/suspense de la app y pinta un respaldo
 * mínimo con botón de recarga. Los textos vienen de i18n (la instancia
 * global funciona fuera de React); el detalle crudo solo a console.error.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary ha capturado un error:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {i18n.t('errorBoundary.titulo')}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">{i18n.t('errorBoundary.texto')}</p>
        <Button type="button" onClick={() => window.location.reload()}>
          {i18n.t('errorBoundary.recargar')}
        </Button>
      </div>
    );
  }
}
