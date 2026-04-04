import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { staffName, abn, hourlyRate, hours, weekEnding, totalHours, totalPay } = body;

  if (!staffName || !abn || !hourlyRate || !weekEnding) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Build hours table rows
  const hoursRows = DAYS.map((day) => {
    const h = parseFloat(hours[day]) || 0;
    return `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #1f1f1f; color: #9ca3af;">${day}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #1f1f1f; color: #f9fafb; text-align: right;">${h > 0 ? h : "—"}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #1f1f1f; color: #f9fafb; text-align: right;">${h > 0 ? "$" + (h * parseFloat(hourlyRate)).toFixed(2) : "—"}</td>
      </tr>
    `;
  }).join("");

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #f9fafb; padding: 32px; border-radius: 12px; max-width: 600px; margin: 0 auto;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #1f1f1f;">
        <div style="width: 36px; height: 36px; background: #e11d48; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
          <span style="color: white; font-weight: bold; font-size: 18px;">Y</span>
        </div>
        <div>
          <p style="margin: 0; font-weight: bold; font-size: 14px; color: #f9fafb;">The Yard Gym</p>
          <p style="margin: 0; font-size: 12px; color: #e11d48; text-transform: uppercase; letter-spacing: 0.1em;">Timesheet Notification</p>
        </div>
      </div>

      <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 4px; color: #f9fafb;">New Timesheet Submitted</h1>
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">Week ending: <strong style="color: #f9fafb;">${weekEnding}</strong></p>

      <div style="background: #111111; border: 1px solid #1f1f1f; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Staff Name</td><td style="padding: 6px 0; color: #f9fafb; font-size: 13px; font-weight: 600;">${staffName}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">ABN</td><td style="padding: 6px 0; color: #f9fafb; font-size: 13px;">${abn}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Hourly Rate</td><td style="padding: 6px 0; color: #f9fafb; font-size: 13px;">$${parseFloat(hourlyRate).toFixed(2)} / hr</td></tr>
        </table>
      </div>

      <div style="background: #111111; border: 1px solid #1f1f1f; border-radius: 8px; overflow: hidden; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #1f1f1f;">
              <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Day</th>
              <th style="padding: 10px 12px; text-align: right; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Hours</th>
              <th style="padding: 10px 12px; text-align: right; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Amount</th>
            </tr>
          </thead>
          <tbody>${hoursRows}</tbody>
          <tfoot>
            <tr style="background: #1f1f1f;">
              <td style="padding: 10px 12px; font-weight: 700; color: #f9fafb; font-size: 13px;">Total</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #f9fafb; font-size: 13px;">${totalHours.toFixed(1)} hrs</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #e11d48; font-size: 15px;">$${parseFloat(totalPay).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p style="color: #4b5563; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #1f1f1f;">
        Submitted via The Yard Gym Dashboard · ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}
      </p>
    </div>
  `;

  // Use Gmail SMTP (configure via env vars)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: `"The Yard Gym Dashboard" <${process.env.SMTP_USER}>`,
      to: process.env.NOTIFY_EMAIL || process.env.SMTP_USER,
      subject: `Timesheet: ${staffName} — Week ending ${weekEnding}`,
      html: htmlBody,
    });
  } catch (emailErr) {
    console.error("Email send failed:", emailErr);
    // Don't fail the whole request just because email failed
    // In production you'd want to handle this better
  }

  return NextResponse.json({ success: true });
}
