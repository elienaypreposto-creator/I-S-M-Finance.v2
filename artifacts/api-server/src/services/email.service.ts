/**
 * Email Service - envio transacional via SMTP (Nodemailer).
 *
 * Variáveis de ambiente obrigatórias:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *
 * Opcionais:
 *   SMTP_SECURE (default: false - usar STARTTLS na porta 587)
 *   SMTP_FROM (default: "ISM Finance <noreply@ism.finance>")
 */

import nodemailer from "nodemailer";

function createTransporter() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const port = process.env.SMTP_PORT ?? "587";
    const secure = process.env.SMTP_SECURE === "true";

    if (!host || !user || !pass) {
        throw new Error(
            `SMTP mal configurado - variáveis ausentes: ${[
                !host && "SMTP_HOST",
                !user && "SMTP_USER",
                !pass && "SMTP_PASS",
            ]
                .filter(Boolean)
                .join(", ")}.`,
        );
    }

    return nodemailer.createTransport({
        host,
        port: parseInt(port, 10),
        secure,
        auth: {user, pass},
    });
}

const FROM = process.env.SMTP_FROM ?? "ISM Finance <noreply@ism.finance>";

/**
 * E-mail de boas-vindas para fluxo OTP (sem senha definida pelo admin).
 *
 * O `otp` é um código de primeiro acesso que direciona o utilizador para /primeiro-acesso,
 * onde ele valida o código e define a própria senha.
 */
export async function sendWelcomeEmail(to: string, nome: string, otp: string, originUrl: string): Promise<void> {
    const link = `${originUrl}/definir-senha?email=${encodeURIComponent(to)}&token=${encodeURIComponent(otp)}`;
    const manualUrl = `${originUrl}/primeiro-acesso`;

    // Formata o OTP em dois grupos de 4 para facilitar a leitura manual (ex: "3RXM 5WKP")
    const otpFormatado = otp.length === 8
        ? `${otp.slice(0, 4)} ${otp.slice(4)}`
        : otp;

    try {
        await createTransporter().sendMail({
            from: FROM,
            to,
            subject: "ISM Finance - Bem-vindo! Ative o seu acesso",
            text: [
                `Olá, ${nome}!`,
                ``,
                `Bem-vindo ao ISM Finance. A sua conta foi criada com sucesso.`,
                ``,
                `═══════════════════════════════`,
                `  CÓDIGO DE ATIVAÇÃO`,
                `  ${otpFormatado}`,
                `═══════════════════════════════`,
                ``,
                `OPÇÃO 1 (recomendada) - Clique no link abaixo para definir a sua senha automaticamente:`,
                `${link}`,
                ``,
                `OPÇÃO 2 - Aceda manualmente em ${manualUrl}`,
                `e insira o código de ativação acima quando solicitado.`,
                ``,
                `⚠️  O código é de uso único e expira após a utilização.`,
                `Se não solicitou este acesso, ignore este e-mail.`,
            ].join("\n"),
            html: `
<div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,.10);">

  <!-- Cabeçalho -->
  <div style="background:#0f111a;padding:24px;text-align:center;">
    <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#60a5fa;">ISM FINANCE</p>
    <h1 style="color:#ffffff;margin:6px 0 0;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Ative o seu acesso</h1>
  </div>

  <!-- Corpo -->
  <div style="padding:32px 28px;">
    <h2 style="color:#111827;font-size:18px;margin:0 0 8px;">Olá, ${nome}!</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.7;margin:0 0 24px;">
      A sua conta no <strong>ISM Finance</strong> foi criada com sucesso.
      Para activar o acesso, utilize o código ou o botão abaixo.
    </p>

    <!-- Bloco do OTP - destaque principal -->
    <div style="background:#0f111a;border-radius:10px;padding:24px 20px;margin:0 0 24px;text-align:center;border:1px solid #1e2433;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;">
        Código de Ativação
      </p>
      <div style="display:inline-block;background:#1e2433;border-radius:8px;padding:14px 28px;border:1px solid #334155;">
        <span style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:#38bdf8;display:block;line-height:1;">
          ${otpFormatado}
        </span>
      </div>
      <p style="margin:12px 0 0;font-size:11px;color:#64748b;line-height:1.5;">
        Insira este código em
        <a href="${manualUrl}" style="color:#38bdf8;text-decoration:none;font-weight:600;">/primeiro-acesso</a>
        caso não consiga clicar no botão abaixo.
      </p>
    </div>

    <!-- Divisor "ou" -->
    <div style="display:flex;align-items:center;gap:12px;margin:0 0 24px;">
      <div style="flex:1;height:1px;background:#e5e7eb;"></div>
      <span style="color:#9ca3af;font-size:12px;font-weight:600;">OU CLIQUE DIRETAMENTE</span>
      <div style="flex:1;height:1px;background:#e5e7eb;"></div>
    </div>

    <!-- Botão de acção -->
    <div style="text-align:center;margin:0 0 20px;">
      <a href="${link}"
         style="display:inline-block;background:#0ea5e9;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.3px;">
        Definir Senha e Ativar Conta →
      </a>
    </div>

    <!-- Info de login + aviso -->
    <div style="background:#f8fafc;border-radius:8px;padding:14px 16px;margin:0 0 16px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 4px;color:#374151;font-size:13px;">
        <strong>E-mail de login:</strong>
        <span style="color:#2563eb;">${to}</span>
      </p>
    </div>

    <p style="color:#4b5563;font-size:12px;line-height:1.6;background:#fef9ec;border-left:3px solid #f59e0b;padding:10px 14px;border-radius:4px;margin:0;">
      ⚠️ O código e o link são de <strong>uso único</strong> e expiram após a primeira utilização.
      Se não solicitou este acesso, ignore este e-mail.
    </p>

    <!-- Fallback do link -->
    <p style="color:#9ca3af;font-size:10px;text-align:center;margin:20px 0 0;line-height:1.5;">
      Se o botão não funcionar, copie e cole no navegador:<br>
      <span style="word-break:break-all;color:#6b7280;">${link}</span>
    </p>
  </div>

  <!-- Rodapé -->
  <div style="background:#f9fafb;padding:14px 24px;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="color:#9ca3af;font-size:11px;margin:0;">
      Este e-mail é gerado automaticamente - por favor, não responda.
    </p>
  </div>
</div>`,
        });
    } catch (error: unknown) {
        const smtpErr = error as { code?: string; response?: string; responseCode?: number; command?: string };
        console.error("[SMTP ERROR] Falha física no envio do e-mail:", {
            to,
            code: smtpErr.code,
            responseCode: smtpErr.responseCode,
            response: smtpErr.response,
            command: smtpErr.command,
            raw: error,
        });
        throw error;
    }
}

/**
 * E-mail de boas-vindas para fluxo em que o administrador já definiu a senha.
 */
export async function sendAdminCreatedAccountEmail(to: string, nome: string, originUrl: string): Promise<void> {
    const link = `${originUrl}/login`;

    try {
        await createTransporter().sendMail({
            from: FROM,
            to,
            subject: "ISM Finance - Conta criada! Acesse a plataforma",
            text: [
                `Olá, ${nome}!`,
                ``,
                `Sua conta no ISM Finance foi criada pelo administrador do sistema.`,
                ``,
                `Utilize as credenciais abaixo para entrar:`,
                `  Login: ${to}`,
                `  Senha: conforme informada pelo administrador`,
                ``,
                `Recomendamos alterar a sua senha após o primeiro acesso.`,
                ``,
                `Acessar a plataforma: ${link}`,
                ``,
                `Se você não esperava receber este e-mail, contacte o administrador.`,
            ].join("\n"),
            html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background-color: #1a1a24; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">ISM Finance</h1>
        </div>
        <div style="padding: 32px 24px;">
          <h2 style="color: #111827; font-size: 20px; margin-top: 0;">Olá, ${nome}! 👋</h2>
          <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
            A sua conta no <strong>ISM Finance</strong> foi criada pelo administrador e já está pronta para uso.
          </p>

          <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; color: #374151; font-size: 14px;">
              <strong>Login (e-mail):</strong> <span style="color: #2563eb;">${to}</span>
            </p>
            <p style="margin: 0; color: #374151; font-size: 14px;">
              <strong>Senha:</strong> conforme comunicada pelo administrador
            </p>
          </div>

          <p style="color: #4b5563; font-size: 14px; line-height: 1.6; background: #ecfdf5; border-left: 3px solid #10b981; padding: 10px 14px; border-radius: 4px; margin-bottom: 24px;">
            🔒 Por segurança, recomendamos que altere a sua senha após o primeiro acesso em <strong>Configurações&nbsp;&gt;&nbsp;Minha Conta</strong>.
          </p>

          <div style="text-align: center;">
            <a href="${link}" style="display: inline-block; background-color: #0ea5e9; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;">
              Acessar a Plataforma
            </a>
          </div>
        </div>
        <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">
            Se você não esperava receber este e-mail, contacte o administrador do sistema.
          </p>
        </div>
      </div>`,
        });
    } catch (error: unknown) {
        const smtpErr = error as { code?: string; response?: string; responseCode?: number; command?: string };
        console.error("[SMTP ERROR] Falha física no envio do e-mail:", {
            to,
            code: smtpErr.code,
            responseCode: smtpErr.responseCode,
            response: smtpErr.response,
            command: smtpErr.command,
            raw: error,
        });
        throw error;
    }
}

export async function sendPasswordResetEmail(
    to: string,
    resetToken: string,
    originUrl: string,
): Promise<void> {
    const link = `${originUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;

    await createTransporter().sendMail({
        from: FROM,
        to,
        subject: "ISM Finance - Redefinição de senha",
        text: `Para redefinir a sua senha acesse o link (válido por 1 hora):\n${link}`,
        html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a1a1a">Redefinição de Senha</h2>
        <p>Recebemos uma solicitação de redefinição de senha para esta conta.</p>
        <a href="${link}"
           style="display:inline-block;margin:16px 0;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">
          Redefinir Senha
        </a>
        <p style="color:#666;font-size:13px">
          Se não solicitou esta alteração, ignore este e-mail.<br>
          O link expira em 1 hora.
        </p>
      </div>`,
    });
}
