import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface UsuarioRequest {
  sub: string;
  email: string;
  nombre?: string | null;
  avatarUrl?: string | null;
  proveedor?: string;
}

export const UsuarioActual = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UsuarioRequest => {
    const request = context.switchToHttp().getRequest();
    return request.user as UsuarioRequest;
  },
);
