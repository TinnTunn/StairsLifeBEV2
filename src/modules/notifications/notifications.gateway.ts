// Gateway WebSocket namespace /notifications untuk dorongan waktu nyata.

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { buildCorsOriginList } from '../../common/cors.util';

const WS_ALLOWED_ORIGINS = buildCorsOriginList();

@Injectable()
@WebSocketGateway({
  cors: {
    origin: WS_ALLOWED_ORIGINS,
    credentials: false,
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  private userSockets = new Map<string, Set<string>>(); // userId → Set<socketId>

  constructor(private jwtService: JwtService) {
    this.logger.log(
      `WS /notifications allowed origins: ${WS_ALLOWED_ORIGINS.join(', ') || '(none)'}`,
    );
  }

  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth as Record<string, string> | undefined)?.token ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.emit('error', { message: 'Token tidak ditemukan' });
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify<Record<string, string>>(token);
      const userId = payload['sub'] ?? payload['id'];

      if (!userId) {
        client.emit('error', { message: 'Token tidak valid' });
        client.disconnect();
        return;
      }

      if (payload['type'] === 'refresh') {
        client.emit('error', {
          message: 'Refresh token tidak bisa dipakai untuk WebSocket',
        });
        client.disconnect();
        return;
      }

      client.data = { userId } as Record<string, string>;

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(client.id);

      void client.join(`user:${userId}`);

      client.emit('connected', { userId });
      this.logger.log(`Notif connected: ${userId} (socket: ${client.id})`);
    } catch {
      client.emit('error', { message: 'Autentikasi gagal' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client.data as Record<string, string>)?.userId;
    if (userId) {
      const set = this.userSockets.get(userId);
      if (set) {
        set.delete(client.id);
        if (set.size === 0) this.userSockets.delete(userId);
      }
    }
    this.logger.log(`Notif disconnected: ${client.id}`);
  }

  async pushToUser(userId: string, notif: unknown): Promise<boolean> {
    if (!this.server) return false;
    const sockets = this.userSockets.get(userId);
    const isOnline = !!sockets && sockets.size > 0;

    this.server.to(`user:${userId}`).emit('new_notification', notif);

    if (isOnline) {
      this.logger.log(`Notif pushed to ${userId} (${sockets.size} device)`);
    }
    return isOnline;
  }

  async pushUnreadCount(userId: string, count: number): Promise<void> {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit('unread_count', { count });
  }
}
