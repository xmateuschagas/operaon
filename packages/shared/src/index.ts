import { z } from 'zod';

// Identificadores recebidos pela API nunca entram em SQL sem validação.
export const uuidSchema = z.string().uuid();
export const stages = ['NOVO', 'CONTATO_INICIADO', 'QUALIFICADO', 'PROPOSTA_ENVIADA', 'NEGOCIACAO', 'GANHO', 'PERDIDO'] as const;
export const stageSchema = z.enum(stages);
