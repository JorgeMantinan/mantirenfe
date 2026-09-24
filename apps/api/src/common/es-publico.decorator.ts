import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO_KEY = 'esPublico';

export const EsPublico = () => SetMetadata(ES_PUBLICO_KEY, true);
