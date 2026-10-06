import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SesionController } from './sesion.controller';
import { SesionService } from './sesion.service';

@Module({
  controllers: [AuthController, SesionController],
  providers: [AuthService, SesionService],
  exports: [AuthService, SesionService],
})
export class AuthModule {}
