import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

let transporter: nodemailer.Transporter

function getTransporter() {
  if (transporter) return transporter

  if (env.SMTP_HOST && env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  } else {
    // Dev fallback: log to console instead of sending
    transporter = {
      sendMail: async (opts: nodemailer.SendMailOptions) => {
        console.log('\n📧 [DEV EMAIL] ─────────────────────────────────')
        console.log(`To:      ${opts.to}`)
        console.log(`Subject: ${opts.subject}`)
        console.log(`Body:    ${opts.text || opts.html}`)
        console.log('────────────────────────────────────────────────\n')
        return { messageId: 'dev-' + Date.now() }
      },
    } as unknown as nodemailer.Transporter
  }

  return transporter
}

export async function sendMagicLink(email: string, token: string, name: string) {
  const link = `${env.APP_URL}/auth/verify?token=${token}`

  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: '🥏 Your Putting League Login Link',
    text: `Hi ${name},\n\nClick the link below to sign in to the Putting League:\n\n${link}\n\nThis link expires in ${env.MAGIC_LINK_EXPIRY_MINUTES} minutes.\n\nIf you didn't request this, ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #15803d;">🥏 Putting League Login</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Click the button below to sign in:</p>
        <a href="${link}" style="
          display: inline-block;
          background: #15803d;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: bold;
          margin: 16px 0;
        ">Sign In to League</a>
        <p style="color: #6b7280; font-size: 14px;">
          This link expires in ${env.MAGIC_LINK_EXPIRY_MINUTES} minutes.<br/>
          If you didn't request this, ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">
          Or copy this link: ${link}
        </p>
      </div>
    `,
  })
}
