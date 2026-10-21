-- O fallback SHA-256 e o endpoint /auth/migrate-passwords foram removidos do código.
-- Remove a permissão órfã das concessões existentes.
DELETE FROM "usuario_permissoes" WHERE "codigo_permissao" = 'admin:migrate-passwords';