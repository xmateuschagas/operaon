// O canal pode mudar sem afetar aprovação, convite ou regras de lead.
export interface Notice { kind: 'approval' | 'invitation' | 'reschedule'; tenantId: string; userId?: string; destination?: string; link?: string; message: string }
export interface Notifier { notify(notice: Notice): Promise<void> }
export class LogNotifier implements Notifier {
  constructor(private readonly log: (record: Record<string, unknown>) => void) {}
  async notify(notice: Notice) {
    // Não registrar destinatário, mensagem livre ou URL com token no canal de desenvolvimento.
    this.log({ kind: notice.kind, tenant_id: notice.tenantId, user_id: notice.userId ?? null, delivery: 'log_only' });
  }
}
