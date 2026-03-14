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

// ── Forum notification helpers ─────────────────────────────────────────────────

const emailBase = `
  <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #111827;">
    <div style="background: #15803d; padding: 16px 24px; border-radius: 8px 8px 0 0;">
      <span style="color: white; font-size: 20px; font-weight: bold;">🥏 Putting League Forum</span>
    </div>
    <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; padding: 24px;">
`

const emailFooter = `
    </div>
    <p style="color: #9ca3af; font-size: 11px; margin-top: 16px; text-align: center;">
      To change your notification settings, visit your
      <a href="${env.APP_URL}/profile" style="color: #15803d;">profile page</a>.
    </p>
  </div>
`

interface ForumNotificationOpts {
  to: string
  name: string
  description: string
  postTitle: string
  postUrl: string
}

export async function sendForumNotification(opts: ForumNotificationOpts) {
  const { to, name, description, postTitle, postUrl } = opts

  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `🥏 Forum: ${postTitle}`,
    text: `Hi ${name},\n\n${description}\n\nView the post: ${postUrl}\n\n──\nTo change notification settings, visit ${env.APP_URL}/profile`,
    html: `
      ${emailBase}
        <p>Hi <strong>${name}</strong>,</p>
        <p style="margin: 16px 0;">${description}</p>
        <a href="${postUrl}" style="
          display: inline-block;
          background: #15803d;
          color: white;
          padding: 10px 20px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: bold;
        ">View Post</a>
      ${emailFooter}
    `,
  })
}

interface DigestItem {
  description: string
  postTitle: string
  postUrl: string
  createdAt: Date
}

interface ForumDigestOpts {
  to: string
  name: string
  items: DigestItem[]
}

export async function sendForumDigest(opts: ForumDigestOpts) {
  const { to, name, items } = opts

  // Group items by postUrl to avoid repeating the same post link
  const byPost = new Map<string, { title: string; url: string; events: string[] }>()
  for (const item of items) {
    const existing = byPost.get(item.postUrl)
    if (existing) {
      existing.events.push(item.description)
    } else {
      byPost.set(item.postUrl, { title: item.postTitle, url: item.postUrl, events: [item.description] })
    }
  }

  const postEntries = Array.from(byPost.values())
  const totalCount = items.length

  const textLines = postEntries.flatMap(p => [
    `• ${p.title} — ${p.url}`,
    ...p.events.map(e => `  - ${e}`),
  ])

  const htmlRows = postEntries.map(p => `
    <div style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px; margin-bottom: 12px;">
      <a href="${p.url}" style="color: #15803d; font-weight: bold; text-decoration: none; font-size: 15px;">${p.title}</a>
      <ul style="margin: 8px 0 0 0; padding-left: 18px; color: #374151; font-size: 14px;">
        ${p.events.map(e => `<li style="margin-bottom: 4px;">${e}</li>`).join('')}
      </ul>
    </div>
  `).join('')

  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `🥏 Your Forum Digest — ${totalCount} update${totalCount !== 1 ? 's' : ''}`,
    text: `Hi ${name},\n\nHere's your daily forum digest:\n\n${textLines.join('\n')}\n\n──\nTo change notification settings, visit ${env.APP_URL}/profile`,
    html: `
      ${emailBase}
        <p>Hi <strong>${name}</strong>,</p>
        <p style="margin-bottom: 16px; color: #6b7280;">
          Here's what happened in the forum today:
        </p>
        ${htmlRows}
        <a href="${env.APP_URL}/forum" style="
          display: inline-block;
          background: #15803d;
          color: white;
          padding: 10px 20px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: bold;
          margin-top: 4px;
        ">Visit the Forum</a>
      ${emailFooter}
    `,
  })
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
