import nodemailer from "nodemailer";
import { env } from '../config/env.js';

const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
    }
});

export async function sendAlertEmail(toEmail, subject, textContent) {
    await transporter.sendMail({
        from: '"Dead Internet Alert" <no-reply@deadinternetalert.com>',
        to: toEmail,
        subject,
        text: textContent
    });
}
