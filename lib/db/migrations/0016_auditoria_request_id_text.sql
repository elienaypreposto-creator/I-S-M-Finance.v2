-- ISMF-18: request_id tem de bater com X-Request-Id (Card 95 / VIN-21).
-- O middleware aceita [\w.:-]{8,128} (não só UUID). Coluna uuid descartava
-- IDs válidos e gravava NULL — critério header ↔ coluna falhava.

ALTER TABLE "logs_auditoria"
    ALTER COLUMN "request_id" TYPE varchar(128)
    USING "request_id"::text;--> statement-breakpoint

ALTER TABLE "logs_auditoria_arquivo"
    ALTER COLUMN "request_id" TYPE varchar(128)
    USING "request_id"::text;
