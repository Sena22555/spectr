import nodemailer from 'nodemailer';

// Письма уходят через SMTP почтового ящика школы (Яндекс: smtp.yandex.ru, 465, пароль приложения).
// Пока SMTP_HOST не задан, письмо печатается в журнал сервера — так весь сценарий
// можно проверить без почты.
const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;
const from = process.env.SMTP_FROM || (user ? `Спектр <${user}>` : 'Спектр <no-reply@spectr.school>');
const siteUrl = (process.env.WEB_ORIGIN ?? '').split(',')[0]?.trim() || '';

const transport = host
  ? nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE !== 'false',
      auth: user ? { user, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

export const mailConfigured = Boolean(transport);

function codeLetter(name: string, lead: string, code: string, label: string) {
  const text = `${name ? `${name}, здравствуйте!` : 'Здравствуйте!'}\n\n${lead}\n\n${label}: ${code}\n\nКод действует 15 минут. Если вы ничего не запрашивали, просто удалите это письмо.\n\nОнлайн-школа «Спектр»${siteUrl ? `\n${siteUrl}` : ''}`;
  const html = `<!doctype html><html lang="ru"><body style="margin:0;background:#fbf8f0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1b2410">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf8f0;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e7e1cf">
<tr><td style="padding:28px 30px 0">
  ${siteUrl ? `<img src="${siteUrl}/mail-logo.png" width="64" height="64" alt="Спектр" style="display:block;border-radius:14px">` : ''}
  <p style="font-size:22px;font-weight:700;margin:18px 0 0">${name ? `${escapeHtml(name)}, здравствуйте!` : 'Здравствуйте!'}</p>
  <p style="font-size:16px;line-height:1.5;margin:10px 0 0;color:#4a5340">${lead}</p>
</td></tr>
<tr><td style="padding:22px 30px 0" align="center">
  <div style="background:#ffe987;border-radius:12px;padding:18px 12px">
    <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#1a3300">${label}</div>
    <div style="font-size:38px;font-weight:800;letter-spacing:.2em;color:#1a3300;margin-top:6px">${code}</div>
  </div>
</td></tr>
<tr><td style="padding:20px 30px 28px;font-size:14px;line-height:1.5;color:#6b7262">
  Код действует 15 минут. Если вы ничего не запрашивали, просто удалите это письмо.<br><br>Онлайн-школа «Спектр»
</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export const LETTERS = {
  verify: (name: string, code: string) => ({
    subject: `${code} — код подтверждения «Спектр»`,
    ...codeLetter(name, 'Чтобы закончить регистрацию, введите этот код на сайте.', code, 'Код подтверждения'),
  }),
  reset: (name: string, code: string) => ({
    subject: `${code} — смена пароля «Спектр»`,
    ...codeLetter(name, 'Вы запросили смену пароля. Введите этот код на сайте и задайте новый пароль.', code, 'Код для смены пароля'),
  }),
};

export async function sendMail(to: string, letter: { subject: string; text: string; html: string }) {
  if (!transport) {
    console.log(`[письмо не отправлено, SMTP не настроен] ${to} · ${letter.subject}\n${letter.text}\n`);
    return;
  }
  await transport.sendMail({ from, to, subject: letter.subject, text: letter.text, html: letter.html });
}
