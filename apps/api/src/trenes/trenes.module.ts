import { Module } from '@nestjs/common';
import { TrenesController } from './trenes.controller';
import { TrenesService } from './trenes.service';

@Module({
  controllers: [TrenesController],
  providers: [TrenesService],
  exports: [TrenesService],
})
export class TrenesModule {}
