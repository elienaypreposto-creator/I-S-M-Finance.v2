/**
 * Email Service — envio transacional via SMTP (Nodemailer).
 *
 * Variáveis de ambiente obrigatórias:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *
 * Opcionais:
 *   SMTP_SECURE  (default: false - usar STARTTLS na porta 587)
 *   SMTP_FROM    (default: "ISM Finance <noreply@ism.finance>")
 */

import nodemailer from "nodemailer";

function createTransporter() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        throw new Error("SMTP_HOST, SMTP_USER e SMTP_PASS são obrigatórios.");
    }

    return nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT ?? "587", 10),
        secure: process.env.SMTP_SECURE === "true",
        auth: {user, pass},
    });
}

const FROM = process.env.SMTP_FROM ?? "ISM Finance <noreply@ism.finance>";

export async function sendWelcomeEmail(to: string, nome: string, otp: string, originUrl: string): Promise<void> {
    const link = `${originUrl}/primeiro-acesso?email=${encodeURIComponent(to)}`;

    await createTransporter().sendMail({
        from: FROM,
        to,
        subject: "ISM Finance — Bem-vindo! Acesso à plataforma",
        text: `Olá, ${nome}!\n\nBem-vindo ao ISM Finance.\n\nSeu acesso inicial:\nLogin: ${to}\nSenha de Acesso Inicial: ${otp}\n\nAcesse o sistema para definir sua senha permanente:\n${link}`,
        html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background-color: #1a1a24; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">ISM Finance</h1>
        </div>
        <div style="padding: 32px 24px;">
          <h2 style="color: #111827; font-size: 20px; margin-top: 0;">Olá, ${nome}!</h2>
          <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
            Bem-vindo ao ISM Finance! Sua conta foi criada com sucesso. Abaixo estão as suas credenciais de acesso inicial:
          </p>
          
          <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 12px 0; color: #374151; font-size: 14px;"><strong>Usuário (Login):</strong> <span style="color: #2563eb;">${to}</span></p>
            <p style="margin: 0; color: #374151; font-size: 14px;"><strong>Senha Inicial:</strong></p>
            <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #111827; text-align: center; margin-top: 8px; padding: 12px; background-color: #e5e7eb; border-radius: 6px;">
              ${otp}
            </div>
          </div>
          
          <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
            Essa senha é de uso único. No seu primeiro acesso, você será solicitado a criar uma senha definitiva e segura.
          </p>
          
          <div style="text-align: center;">
            <a href="${link}" style="display: inline-block; background-color: #0ea5e9; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px; transition: background-color 0.2s;">
              Acessar a Plataforma
            </a>
          </div>
        </div>
        <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">
            Este e-mail é gerado automaticamente. Por favor, não responda.
          </p>
        </div>
      </div>`,
    });
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
        subject: "ISM Finance — Redefinição de senha",
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
