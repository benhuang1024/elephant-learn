import { Module } from "@nestjs/common";
import { DatabaseModule } from "../db/database.module.js";
import { ActuatorController } from "./actuator.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [ActuatorController],
})
export class HealthModule {}
