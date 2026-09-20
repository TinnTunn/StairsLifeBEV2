// Endpoint obrolan kontrak, tanya jawab, dukungan, dan penanda dibaca.

import type { JwtUser } from '../../common/types/jwt-payload.type';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseService } from '../../config/supabase.config';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { IsString, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';
import { Izin } from '../../common/decorators/izin.decorator';
import { IzinAdminGuard } from '../../common/guards/izin-admin.guard';

class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000, { message: 'Pesan terlalu panjang (maks 5000 karakter)' })
  content: string;
}

class DirectMessageDto {
  @IsUUID()
  receiver_id: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}

@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard, IzinAdminGuard)
export class ChatController {
  constructor(
    private supabase: SupabaseService,
    private chatService: ChatService,
    private chatGateway: ChatGateway,
  ) {}

  @Get('rooms')
  async getMyRooms(@CurrentUser() user: JwtUser) {
    const supabase = this.supabase.getClient();
    const { data: contracts } = await supabase
      .from('contracts')
      .select(
        `
        id, status, agreed_budget,
        projects!project_id (id, title),
        users_contracts_student_idTousers:users!student_id (id, full_name),
        users_contracts_business_idTousers:users!business_id (id, full_name)
      `,
      )
      .or(`student_id.eq.${user.id},business_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    const list = contracts || [];
    const ids = list.map((c: any) => c.id);
    const lastMsg: Record<string, any> = {};
    const unreadCount: Record<string, number> = {};
    if (ids.length) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('contract_id, content, created_at, sender_id, is_read')
        .in('contract_id', ids)
        .order('created_at', { ascending: false });
      for (const m of msgs || []) {
        if (!lastMsg[m.contract_id]) lastMsg[m.contract_id] = m; // pertama = terbaru
        if (m.sender_id !== user.id && m.is_read !== true) {
          unreadCount[m.contract_id] = (unreadCount[m.contract_id] || 0) + 1;
        }
      }
    }
    const enriched = list.map((c: any) => ({
      ...c,
      last_message: lastMsg[c.id]?.content ?? null,
      last_message_at: lastMsg[c.id]?.created_at ?? null,
      unread_count: unreadCount[c.id] || 0,
    }));

    return { data: enriched, message: 'Berhasil' };
  }

  @Get('support')
  async getSupportRoom(@CurrentUser() user: JwtUser) {
    const supabase = this.supabase.getClient();
    const roomId = `support-${user.id}`;

    await this._tandaiDibaca(roomId, user.id);

    const { data: messages } = await supabase
      .from('support_messages')
      .select(`*, sender:users!sender_id (id, full_name, role)`)
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    return {
      data: {
        room_id: roomId,
        messages: messages || [],
        last_message: messages?.length
          ? messages[messages.length - 1].content
          : null,
      },
      message: 'Berhasil',
    };
  }

  @Post('support/messages')
  async sendSupportMessage(
    @Body() dto: SendMessageDto,
    @CurrentUser() user: JwtUser,
  ) {
    const supabase = this.supabase.getClient();
    const roomId = `support-${user.id}`;

    const { data, error } = await supabase
      .from('support_messages')
      .insert({
        room_id: roomId,
        sender_id: user.id,
        content: dto.content,
        sender_role: user.role,
        created_at: new Date().toISOString(),
      })
      .select(`*, sender:users!sender_id (id, full_name, role)`)
      .single();

    if (error) throw new Error(error.message);

    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin');
    const senderName =
      (data as { sender?: { full_name?: string } })?.sender?.full_name ||
      (user as { full_name?: string }).full_name ||
      'Pengguna';
    const createdAt =
      (data as { created_at?: string })?.created_at ?? new Date().toISOString();
    for (const a of admins || []) {
      this.chatGateway.emitSupportMessage(a.id, {
        roomId,
        senderUserId: user.id,
        senderRole: user.role as 'student' | 'mahasiswa' | 'bisnis',
        senderName,
        content: dto.content,
        created_at: createdAt,
      });
    }
    this.chatGateway.emitSupportMessage(user.id, {
      roomId,
      senderUserId: user.id,
      senderRole: user.role as 'student' | 'mahasiswa' | 'bisnis',
      senderName,
      content: dto.content,
      created_at: createdAt,
    });

    return { data, message: 'Pesan terkirim' };
  }

  @Get('support-inbox')
  @Roles('admin')
  @Izin('Support')
  async getSupportInbox(@CurrentUser() _user: JwtUser) {
    const supabase = this.supabase.getClient();

    const { data: messages } = await supabase
      .from('support_messages')
      .select(
        `
        room_id, content, created_at,
        sender:users!sender_id (id, full_name, role, is_suspended, suspension_reason)
      `,
      )
      .order('created_at', { ascending: false });

    const rooms: Record<string, any> = {};
    (messages || []).forEach((m: any) => {
      if (!rooms[m.room_id]) {
        rooms[m.room_id] = {
          room_id: m.room_id,
          user_id: m.sender?.id,
          user_name: m.sender?.full_name,
          user_role: m.sender?.role,
          is_suspended: m.sender?.is_suspended,
          suspension_reason: m.sender?.suspension_reason,
          last_message: m.content,
          updated_at: m.created_at,
        };
      }
    });

    return { data: Object.values(rooms), message: 'Berhasil' };
  }

  @Post('support/:roomId/reply')
  @Roles('admin')
  @Izin('Support')
  async adminReplySupport(
    @Param('roomId') roomId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: JwtUser,
  ) {
    const supabase = this.supabase.getClient();

    const { data, error } = await supabase
      .from('support_messages')
      .insert({
        room_id: roomId,
        sender_id: user.id,
        content: dto.content,
        sender_role: 'admin',
        created_at: new Date().toISOString(),
      })
      .select(`*, sender:users!sender_id (id, full_name, role)`)
      .single();

    if (error) throw new Error(error.message);

    const recipientUserId = roomId.replace(/^support-/, '');
    const senderName =
      (data as { sender?: { full_name?: string } })?.sender?.full_name ||
      (user as { full_name?: string }).full_name ||
      'Admin Support';
    const createdAt =
      (data as { created_at?: string })?.created_at ?? new Date().toISOString();
    if (recipientUserId) {
      this.chatGateway.emitSupportMessage(recipientUserId, {
        roomId,
        senderUserId: user.id,
        senderRole: 'admin',
        senderName,
        content: dto.content,
        created_at: createdAt,
      });
    }
    this.chatGateway.emitSupportMessage(user.id, {
      roomId,
      senderUserId: user.id,
      senderRole: 'admin',
      senderName,
      content: dto.content,
      created_at: createdAt,
    });

    return { data, message: 'Balasan terkirim' };
  }

  @Get('support-rooms')
  @Roles('admin')
  @Izin('Support')
  async getSupportRooms(@CurrentUser() _user: JwtUser) {
    const supabase = this.supabase.getClient();
    const { data: users } = await supabase
      .from('users')
      .select(
        'id, full_name, email, role, is_suspended, suspension_reason, created_at',
      )
      .eq('is_suspended', true)
      .order('created_at', { ascending: false });

    return { data: users || [], message: 'Berhasil' };
  }

  @Get('support-history/:roomId')
  @Roles('admin')
  @Izin('Support')
  async getSupportHistory(
    @Param('roomId') roomId: string,
    @CurrentUser() user: JwtUser,
  ) {
    const supabase = this.supabase.getClient();
    await this._tandaiDibaca(roomId, user.id);
    const { data } = await supabase
      .from('support_messages')
      .select(`*, sender:users!sender_id (id, full_name, role)`)
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });
    return { data: data || [], message: 'Berhasil' };
  }

  @Get(':contractId/messages')
  async getMessages(
    @Param('contractId') contractId: string,
    @CurrentUser() user: JwtUser,
  ) {
    const hasAccess = await this.chatService.validateContractAccess(
      contractId,
      user.id,
    );
    if (!hasAccess && user.role !== 'admin') {
      throw new ForbiddenException(
        'Kamu tidak punya akses ke chat kontrak ini',
      );
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('messages')
      .select(`*, sender:users!sender_id (id, full_name, role)`)
      .eq('contract_id', contractId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    if (user.role !== 'admin') {
      try {
        await this.chatService.markAsRead(contractId, user.id);
      } catch (_) {
        // Non-fatal — fetch tetap success, mark-read bisa retry next time.
      }
    }

    return { data, message: 'Berhasil' };
  }

  @Post(':contractId/messages')
  async sendMessage(
    @Param('contractId') contractId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: JwtUser,
  ) {
    const hasAccess = await this.chatService.validateContractAccess(
      contractId,
      user.id,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        'Kamu tidak punya akses untuk mengirim pesan di kontrak ini',
      );
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('messages')
      .insert({
        contract_id: contractId,
        sender_id: user.id,
        content: dto.content,
        created_at: new Date().toISOString(),
      })
      .select(`*, sender:users!sender_id (id, full_name, role)`)
      .single();

    if (error) throw new Error(error.message);

    try {
      const parties = await this.chatService.getContractParties(contractId);
      const recipientId = parties
        ? parties.student_id === user.id
          ? parties.business_id
          : parties.student_id
        : null;
      const senderName =
        (data as { sender?: { full_name?: string } })?.sender?.full_name ||
        (user as { full_name?: string }).full_name ||
        'Seseorang';
      this.chatGateway.emitContractMessage(
        contractId,
        data,
        user.id,
        recipientId,
        senderName,
      );
    } catch {
      // Non-fatal — simpan sudah berhasil. Push realtime gagal tidak boleh
      // membatalkan response. User bisa refresh untuk lihat.
    }

    return { data, message: 'Pesan terkirim' };
  }

  @Post('direct')
  async sendDirectMessage(
    @Body() dto: DirectMessageDto,
    @CurrentUser() user: JwtUser,
  ) {
    const supabase = this.supabase.getClient();

    const { data: contract } = await supabase
      .from('contracts')
      .select('id, student_id, business_id')
      .or(
        `and(student_id.eq.${user.id},business_id.eq.${dto.receiver_id}),and(student_id.eq.${dto.receiver_id},business_id.eq.${user.id})`,
      )
      .limit(1)
      .maybeSingle();

    if (!contract) {
      throw new NotFoundException(
        'Belum ada kontrak antara kamu dan user ini. Chat tersedia setelah kontrak dibuat.',
      );
    }

    if (contract.student_id !== user.id && contract.business_id !== user.id) {
      throw new ForbiddenException('Kamu bukan pihak di kontrak ini');
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        contract_id: contract.id,
        sender_id: user.id,
        content: dto.content,
        created_at: new Date().toISOString(),
      })
      .select(`*, sender:users!sender_id (id, full_name, role)`)
      .single();

    if (error) throw new Error(error.message);
    return { data, message: 'Pesan terkirim' };
  }

  private _buildInquiryRoomId(userIdA: string, userIdB: string): string {
    const [a, b] = [userIdA, userIdB].sort();
    return `inquiry-${a}-${b}`;
  }

  private async _tandaiDibaca(roomId: string, pembacaId: string) {
    try {
      await this.supabase
        .getClient()
        .from('support_messages')
        .update({ is_read: true })
        .eq('room_id', roomId)
        .neq('sender_id', pembacaId)
        .eq('is_read', false);
    } catch {
      /* diabaikan, lihat alasan di atas */
    }
  }

  @Get('inquiry/:otherUserId/messages')
  async getInquiryMessages(
    @Param('otherUserId') otherUserId: string,
    @CurrentUser() user: JwtUser,
  ) {
    if (otherUserId === user.id) {
      throw new ForbiddenException('Tidak bisa chat dengan diri sendiri');
    }

    const supabase = this.supabase.getClient();
    const roomId = this._buildInquiryRoomId(user.id, otherUserId);

    const { data: targetUser } = await supabase
      .from('users')
      .select('id, full_name, role, avatar_url')
      .eq('id', otherUserId)
      .maybeSingle();
    if (!targetUser) {
      throw new NotFoundException('User tidak ditemukan');
    }

    await this._tandaiDibaca(roomId, user.id);

    const { data: messages, error } = await supabase
      .from('support_messages')
      .select(`*, sender:users!sender_id (id, full_name, role, avatar_url)`)
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return {
      data: {
        room_id: roomId,
        other_user: targetUser,
        messages: messages || [],
      },
      message: 'Berhasil',
    };
  }

  @Post('inquiry/:otherUserId/messages')
  async sendInquiryMessage(
    @Param('otherUserId') otherUserId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: JwtUser,
  ) {
    if (otherUserId === user.id) {
      throw new ForbiddenException('Tidak bisa chat dengan diri sendiri');
    }

    const supabase = this.supabase.getClient();

    const { data: targetUser } = await supabase
      .from('users')
      .select('id, is_suspended')
      .eq('id', otherUserId)
      .maybeSingle();
    if (!targetUser) {
      throw new NotFoundException('User tidak ditemukan');
    }
    if (targetUser.is_suspended) {
      throw new ForbiddenException('User ini sedang disuspend');
    }

    const roomId = this._buildInquiryRoomId(user.id, otherUserId);

    const { data, error } = await supabase
      .from('support_messages')
      .insert({
        room_id: roomId,
        sender_id: user.id,
        content: dto.content,
        sender_role: user.role,
        created_at: new Date().toISOString(),
      })
      .select(`*, sender:users!sender_id (id, full_name, role, avatar_url)`)
      .single();

    if (error) throw new Error(error.message);

    void this.chatService.notifyInquiry?.(otherUserId, user, dto.content);

    const senderName =
      (data as { sender?: { full_name?: string } })?.sender?.full_name ||
      (user as { full_name?: string }).full_name ||
      'Pengguna';
    const createdAt =
      (data as { created_at?: string })?.created_at ?? new Date().toISOString();
    const payload = {
      roomId,
      senderUserId: user.id,
      senderRole: user.role as 'student' | 'mahasiswa' | 'bisnis' | 'admin',
      senderName,
      content: dto.content,
      created_at: createdAt,
    };
    this.chatGateway.emitSupportMessage(otherUserId, payload);
    this.chatGateway.emitSupportMessage(user.id, payload);

    return { data, message: 'Pesan terkirim' };
  }

  @Get('inquiry-rooms')
  async getInquiryRooms(@CurrentUser() user: JwtUser) {
    const supabase = this.supabase.getClient();

    const { data: messages } = await supabase
      .from('support_messages')
      .select(
        `
        id, room_id, content, created_at, sender_id,
        sender:users!sender_id (id, full_name, role, avatar_url)
      `,
      )
      .like('room_id', 'inquiry-%')
      .or(`room_id.like.%${user.id}%`)
      .order('created_at', { ascending: false });

    const rooms: Record<string, any> = {};
    for (const m of messages || []) {
      if (!m.room_id.includes(user.id)) continue; // safety filter

      if (!rooms[m.room_id]) {
        const withoutPrefix = m.room_id.replace(/^inquiry-/, '');
        const userA = withoutPrefix.substring(0, 36);
        const userB = withoutPrefix.substring(37); // skip "-"
        const otherId = userA === user.id ? userB : userA;

        rooms[m.room_id] = {
          room_id: m.room_id,
          other_user_id: otherId,
          last_message: m.content,
          last_message_at: m.created_at,
          last_sender_id: m.sender_id,
        };
      }
    }

    const roomList = Object.values(rooms);
    if (roomList.length > 0) {
      const otherIds = [...new Set(roomList.map((r: any) => r.other_user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, role, avatar_url')
        .in('id', otherIds);

      const userMap = new Map((users || []).map((u: any) => [u.id, u]));
      roomList.forEach((r: any) => {
        r.other_user = userMap.get(r.other_user_id) || null;
      });
    }

    return { data: roomList, message: 'Berhasil' };
  }

  private _mediationRoomId(disputeId: string): string {
    return `mediation-${disputeId}`;
  }

  private async _authorizeMediation(disputeId: string, user: JwtUser) {
    const supabase = this.supabase.getClient();
    const { data: dispute } = await supabase
      .from('disputes')
      .select(
        `id, contract_id,
         contracts:contracts!contract_id ( id, student_id, business_id )`,
      )
      .eq('id', disputeId)
      .maybeSingle();

    if (!dispute) throw new NotFoundException('Dispute tidak ditemukan');

    const contract = (dispute as any).contracts;
    const isParticipant =
      contract &&
      (contract.student_id === user.id || contract.business_id === user.id);
    const isAdmin = user.role === 'admin';

    if (!isParticipant && !isAdmin) {
      throw new ForbiddenException(
        'Kamu tidak punya akses ke ruang mediasi ini',
      );
    }
    return dispute as any;
  }

  @Get('mediation/:disputeId/messages')
  async getMediationMessages(
    @Param('disputeId') disputeId: string,
    @CurrentUser() user: JwtUser,
  ) {
    await this._authorizeMediation(disputeId, user);
    const supabase = this.supabase.getClient();
    const roomId = this._mediationRoomId(disputeId);

    const { data: messages, error } = await supabase
      .from('support_messages')
      .select(`*, sender:users!sender_id (id, full_name, role, avatar_url)`)
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return {
      data: {
        room_id: roomId,
        dispute_id: disputeId,
        messages: messages || [],
      },
      message: 'Berhasil',
    };
  }

  @Post('mediation/:disputeId/messages')
  async sendMediationMessage(
    @Param('disputeId') disputeId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: JwtUser,
  ) {
    await this._authorizeMediation(disputeId, user);
    const supabase = this.supabase.getClient();
    const roomId = this._mediationRoomId(disputeId);

    const { data, error } = await supabase
      .from('support_messages')
      .insert({
        room_id: roomId,
        sender_id: user.id,
        content: dto.content,
        sender_role: user.role,
        created_at: new Date().toISOString(),
      })
      .select(`*, sender:users!sender_id (id, full_name, role, avatar_url)`)
      .single();

    if (error) throw new Error(error.message);
    return { data, message: 'Pesan terkirim' };
  }
}
