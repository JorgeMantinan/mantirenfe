import { Module } from '@nestjs/common';
import { SuprimidosController } from './suprimidos.controller';
import { SuprimidosService } from './suprimidos.service';

@Module({
  controllers: [SuprimidosController],
  providers: [SuprimidosService],
  exports: [SuprimidosService],
})
export class SuprimidosModule {}
