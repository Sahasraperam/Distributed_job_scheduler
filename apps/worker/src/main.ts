import './env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { WorkerService } from './worker.service';

async function bootstrap() {
  // Use createApplicationContext because the worker is a background process, not an HTTP web server.
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const workerService = app.get(WorkerService);

  const shutdown = async (signal: string) => {
    console.log(`Received signal: ${signal}`);
    await workerService.shutdown();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  console.log('Worker microservice is initialized and running...');
}
bootstrap();
