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

export async function sendWelcomeEmail(to: string, otp: string): Promise<void> {
    await createTransporter().sendMail({
        from: FROM,
        to,
        subject: "ISM Finance — Seu código de acesso inicial",
        text: `Bem-vindo!\n\nO seu código de acesso é: ${otp}\n\nEste código é de uso único. Acesse o sistema para definir a sua senha.`,
        html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a1a1a">Bem-vindo ao ISM Finance</h2>
        <p>O seu código de acesso inicial é:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#1a1a1a;background:#f4f4f4;padding:16px 24px;border-radius:8px;text-align:center">
          ${otp}
        </div>
        <p style="color:#666;font-size:13px;margin-top:16px">
          Este código é de uso único e expira em 1 hora.
          Acesse o sistema e siga as instruções para definir a sua senha permanente.
        </p>
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
