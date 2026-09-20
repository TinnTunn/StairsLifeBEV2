// Gateway WebSocket namespace /chat untuk pesan waktu nyata.

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { buildCorsOriginList } from '../../common/cors.util';
import { ChatService } from './chat.service';

const WS_ALLOWED_ORIGINS = buildCorsOriginList();

@WebSocketGateway({
  cors: {
    origin: WS_ALLOWED_ORIGINS,
    credentials: false,
  },
  namespace: '/chat', // ws://localhost:3000/chat
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  private connectedUsers = new Map<string, string>();

  constructor(
    private chatService: ChatService,
    private jwtService: JwtService,
  ) {
    this.logger.log(
      `WS /chat allowed origins: ${WS_ALLOWED_ORIGINS.join(', ') || '(none)'}`,
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

      client.data = {
        userId,
        userRole: payload['role'],
        userName: payload['full_name'] ?? payload['name'],
      } as Record<string, string>;

      this.connectedUsers.set(client.id, userId);
      void client.join(`user:${userId}`);
      this.logger.log(`Connected: ${userId} (socket: ${client.id})`);
    } catch {
      client.emit('error', { message: 'Autentikasi gagal' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedUsers.delete(client.id);
    this.logger.log(`Disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { contractId: string },
  ) {
    const { contractId } = data;
    const userId = client.data.userId;

    if (!userId) {
      throw new WsException('Tidak terautentikasi');
    }

    const hasAccess = await this.chatService.validateContractAccess(
      contractId,
      userId,
    );

    if (!hasAccess) {
      client.emit('error', { message: 'Tidak punya akses ke room ini' });
      return;
    }

    const roomName = `contract:${contractId}`;

    const currentRooms = Array.from(client.rooms).filter(
      (r) => r !== client.id && r.startsWith('contract:'),
    );
    for (const room of currentRooms) {
      void client.leave(room);
    }

    void client.join(roomName);

    await this.chatService.markAsRead(contractId, userId);
    client.to(roomName).emit('messages_read', { contractId, readerId: userId });

    const messages = await this.chatService.getMessages(contractId);
    client.emit('message_history', { contractId, messages });

    client.to(roomName).emit('user_joined', {
      userId,
      userName: (client.data as Record<string, string>).userName,
    });

    this.logger.log(`${userId} joined room ${roomName}`);
  }

  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { contractId: string },
  ) {
    const roomName = `contract:${data.contractId}`;
    client.leave(roomName);
    this.logger.log(`${client.data.userId} left room ${roomName}`);
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { contractId: string; content: string },
  ) {
    const { contractId, content } = data;
    const userId = client.data.userId;

    if (!userId) throw new WsException('Tidak terautentikasi');
    if (!content?.trim()) throw new WsException('Pesan tidak boleh kosong');
    if (content.length > 5000) {
      throw new WsException('Pesan terlalu panjang (maks 5000 karakter)');
    }

    const hasAccess = await this.chatService.validateContractAccess(
      contractId,
      userId,
    );
    if (!hasAccess) {
      client.emit('error', { message: 'Tidak punya akses' });
      return;
    }

    const message = await this.chatService.saveMessage(
      contractId,
      userId,
      content.trim(),
    );

    const roomName = `contract:${contractId}`;
    this.server.to(roomName).emit('new_message', {
      contractId,
      message,
    });

    const parties = await this.chatService.getContractParties(contractId);
    if (parties) {
      const recipientId =
        parties.student_id === userId
          ? parties.business_id
          : parties.student_id;
      if (recipientId && recipientId !== userId) {
        this.server.to(`user:${recipientId}`).emit('chat_inbox', {
          contractId,
          preview: content.trim().slice(0, 140),
          senderName:
            (client.data as Record<string, string>).userName || 'Seseorang',
          created_at: (message as { created_at?: string }).created_at,
        });
      }
    }

    this.logger.log(`Message in ${roomName} from ${userId}`);
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { contractId: string },
  ) {
    const userId = client.data.userId;
    if (!userId || !data?.contractId) return;

    await this.chatService.markAsRead(data.contractId, userId);
    const roomName = `contract:${data.contractId}`;
    client.to(roomName).emit('messages_read', {
      contractId: data.contractId,
      readerId: userId,
    });
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { contractId: string; isTyping: boolean },
  ) {
    const roomName = `contract:${data.contractId}`;
    client.to(roomName).emit('user_typing', {
      userId: client.data.userId,
      userName: client.data.userName,
      isTyping: data.isTyping,
    });
  }

  emitSupportMessage(
    recipientUserId: string,
    payload: {
      roomId: string;
      senderUserId: string;
      senderRole: 'student' | 'mahasiswa' | 'bisnis' | 'admin';
      senderName: string;
      content: string;
      created_at: string;
    },
  ): void {
    if (!recipientUserId || !this.server) return;
    this.server.to(`user:${recipientUserId}`).emit('support_message', payload);
  }

  emitContractMessage(
    contractId: string,
    message: unknown,
    senderId: string,
    recipientId: string | null,
    senderName: string,
  ): void {
    if (!contractId || !this.server) return;
    const roomName = `contract:${contractId}`;
    this.server.to(roomName).emit('new_message', { contractId, message });
    if (recipientId && recipientId !== senderId) {
      const content =
        (message as { content?: string })?.content?.toString() ?? '';
      const createdAt =
        (message as { created_at?: string })?.created_at ??
        new Date().toISOString();
      this.server.to(`user:${recipientId}`).emit('chat_inbox', {
        contractId,
        preview: content.slice(0, 140),
        senderName: senderName || 'Seseorang',
        created_at: createdAt,
      });
    }
  }
}
