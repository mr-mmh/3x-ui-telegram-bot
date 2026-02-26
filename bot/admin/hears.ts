import db from "@/db";
import { ADMIN_ID } from "../constants";
import type { BotContext } from "../types";
import { InlineKeyboard } from "grammy";

export async function depositeReqHears(ctx: BotContext) {
    const payments = await db.payment.findMany({
        where: { status: "PENDING" },
    });

    if (payments.length === 0) {
        await ctx.reply("هیچ فیش جدیدی برای بررسی وجود ندارد!");
    }

    for (const payment of payments) {
        const meta =
            typeof payment.metadata === "string"
                ? JSON.parse(payment.metadata)
                : (payment.metadata as any);
        if (!meta) continue;
        if (meta.action === "BUY_PLAN") {
            const adminKeyboard = new InlineKeyboard()
                // ID پرداخت را در دکمه ذخیره می‌کنیم تا بدانیم کدام رکورد را آپدیت کنیم
                .text("✅ تأیید پرداخت", `admin_approve_pay:${payment.id}`)
                .text("❌ رد پرداخت", `admin_reject_pay:${payment.id}`);
            await ctx.api.sendPhoto(String(ADMIN_ID), payment.receiptImageId, {
                caption: `رسید کاربر ${payment.userId}
                جهت خرید سرویس
                 `,
                reply_markup: adminKeyboard,
            });
        }
        if (meta.action === "WALLET_DEPOSIT") {
            const adminKeyboard = new InlineKeyboard()
                .text("✅ تأیید", `admin_approve_deposit:${payment.id}`)
                .text("❌ رد کردن", `admin_reject_deposit:${payment.id}`);
            const caption = `
🔔 *درخواست شارژ کیف پول*

👤 کاربر: ${payment.userId}
💰 مبلغ: ${payment.amount.toLocaleString("fa-IR")} تومان

    `;
            await ctx.api.sendPhoto(String(ADMIN_ID), payment.receiptImageId, {
                caption,
                reply_markup: adminKeyboard,
            });
        }
    }
    return;
}

export async function listPlanHears(ctx: BotContext) {
    if (!ctx.from || BigInt(ctx.from.id) !== ADMIN_ID) return;

    let msg = "📊 پلن ها:\n\n";
    const plans = await db.plan.findMany();

    for (const plan of plans) {
        msg += `📌 **${plan.name}**\n📦`;
    }

    await ctx.reply(msg);
}

export async function statsHears(ctx: BotContext) {
    if (!ctx.from || BigInt(ctx.from.id) !== ADMIN_ID) return;

    const usersCount = await db.user.count();
    const payments = await db.payment.findMany();
    const subscriptions = await db.subscription.findMany({
        include: { plan: true },
    });

    const approvedPayments = payments.filter((p) => p.status === "APPROVED");

    const totalPaymentsAmount = approvedPayments.reduce((prev, cur) => {
        return prev + cur.amount;
    }, 0);

    const totalSubGB = subscriptions.reduce((prev, curr) => {
        return prev + curr.plan.capacityGB;
    }, 0);

    const msg = `
تعداد کاربران: ${usersCount}
-----------------
تعداد کل عملیات های پرداخت: ${payments.length}
تعداد کل عملیات های پرداخت موفق: ${approvedPayments.length}
مجموع پرداختی ها: ${totalPaymentsAmount.toLocaleString("fa-IR")} تومان
-----------------
تعداد کل سرویس های ساخته شده: ${subscriptions.length}
مجموع حجم سرویس ها: ${totalSubGB} GB
    `;

    await ctx.reply(msg, { parse_mode: "Markdown" });
}
