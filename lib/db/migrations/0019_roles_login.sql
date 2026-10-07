-- LOGIN sem senha no SQL. migrate.ts aplica PASSWORD via env (format %L).
-- ism_app / ism_admin nasceram NOLOGIN em 0013; daqui em diante a API liga
-- directo nestas roles — SET ROLE deixa de ser o mecanismo de "descer" de superuser.

ALTER
ROLE ism_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT;--> statement-breakpoint
ALTER
ROLE ism_admin WITH LOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE INHERIT;--> statement-breakpoint

DO
$$
BEGIN
        IF
NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ism_owner') THEN
CREATE ROLE ism_owner NOSUPERUSER
                NOCREATEDB
                NOCREATEROLE
                LOGIN
                INHERIT;
ELSE
            ALTER
ROLE ism_owner WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
END IF;
END
$$;--> statement-breakpoint

GRANT USAGE ON SCHEMA
public TO ism_owner;--> statement-breakpoint
GRANT
SELECT,
INSERT
,
UPDATE,
DELETE
ON ALL TABLES IN SCHEMA public TO ism_owner;--> statement-breakpoint
GRANT
USAGE,
SELECT
ON ALL SEQUENCES IN SCHEMA public TO ism_owner;--> statement-breakpoint

DO
$$
BEGIN
EXECUTE format(
        'GRANT CONNECT ON DATABASE %I TO ism_app, ism_admin, ism_owner',
        current_database()
        );
EXCEPTION
        WHEN insufficient_privilege THEN
            NULL;
END
$$;
