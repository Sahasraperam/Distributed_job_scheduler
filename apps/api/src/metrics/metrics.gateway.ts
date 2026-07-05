import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class MetricsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MetricsGateway.name);

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token || client.handshake.query?.token;
    if (!token) {
      this.logger.warn(`Client ${client.id} connected without token, disconnecting`);
      client.disconnect();
      return;
    }

    try {
      const secret = process.env.JWT_SECRET || 'fallback-secret-key-12345';
      jwt.verify(token as string, secret);
      this.logger.log(`Client authenticated: ${client.id}`);
    } catch (e) {
      this.logger.warn(`Client ${client.id} failed JWT verification, disconnecting`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe_job_logs')
  handleSubscribeJobLogs(client: Socket, payload: { jobId: string }) {
    client.join(`job:${payload.jobId}`);
    this.logger.log(`Client ${client.id} subscribed to logs for job: ${payload.jobId}`);
  }

  @SubscribeMessage('unsubscribe_job_logs')
  handleUnsubscribeJobLogs(client: Socket, payload: { jobId: string }) {
    client.leave(`job:${payload.jobId}`);
    this.logger.log(`Client ${client.id} unsubscribed from logs for job: ${payload.jobId}`);
  }

  broadcastMetrics(metrics: any) {
    if (this.server) {
      this.server.emit('system_metrics', metrics);
    }
  }

  broadcastJobLog(jobId: string, log: any) {
    if (this.server) {
      this.server.to(`job:${jobId}`).emit('job_log', log);
    }
  }

  broadcastJobStateChange(payload: any) {
    if (this.server) {
      this.server.emit('job_state_change', payload);
    }
  }
}
