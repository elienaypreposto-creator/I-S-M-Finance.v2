-- A eliminação da empresa conserva logs_auditoria anonimizados.
-- Com a FK, o DELETE em empresas falha enquanto o inteiro permanece na auditoria.
ALTER TABLE "logs_auditoria" DROP CONSTRAINT IF EXISTS "logs_auditoria_empresa_id_empresas_id_fk";--> statement-breakpoint

-- Arquivo frio: a role de administração anonimiza (UPDATE) e não apaga.
REVOKE DELETE ON TABLE "logs_auditoria_arquivo" FROM ism_admin;--> statement-breakpoint
GRANT SELECT, UPDATE ON TABLE "logs_auditoria_arquivo" TO ism_admin;--> statement-breakpoint

-- Retenção fiscal: extrato vencido é marcado, não removido.
ALTER TABLE "extratos" ADD COLUMN IF NOT EXISTS "arquivado_em" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "extratos_retencao_idx" ON "extratos" ("arquivado_em", "periodo_fim");
