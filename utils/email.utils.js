import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "sandbox.smtp.mailtrap.io",
    port: parseInt(process.env.SMTP_PORT || "2525"),
    auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || ""
    }
});

export async function sendAlertEmail(toEmail, subject, textContent) {
    try {
        await transporter.sendMail({
            from: '"Dead Internet Alert" <no-reply@deadinternetalert.com>',
            to: toEmail,
            subject,
            text: textContent
        });
        console.log(`Email alert sent successfully to ${toEmail}`);
    } catch (err) {
        console.error("Failed to send email alert:", err);
    }
}
