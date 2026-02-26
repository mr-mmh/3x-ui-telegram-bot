import db from "@/db";
import { APIClient } from "@/lib/api-client";
import {
    calculateTimeRemaining,
    convertTimestampToFarsiDate,
    formatBytes,
} from "@/lib/format";
import { generateDynamicLink } from "@/lib/link";
import { generateQRCodeBuffer } from "@/lib/qrcode";
import { Composer, InlineKeyboard, InputFile } from "grammy";

export const userHandler = new Composer();

function generateProgressBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return "🟩".repeat(filled) + "⬜️".repeat(empty);
}

userHandler.callbackQuery(/^show_service_details:(.+)/, async (ctx) => {
    const subId = ctx.match[1]!;

    const subscription = await db.subscription.findFirst({
        where: { id: Number(subId) },
        include: { plan: true },
    });

    if (!subscription) {
        await ctx.answerCallbackQuery({
            text: "خطا: سرویس یافت نشد!",
            show_alert: true,
        });
        await ctx.deleteMessage();
        return;
    }

    const apiClient = new APIClient();
    const stats = await apiClient.getTraficsByEmail(subscription.clientEmail);

    if (!stats) {
        await ctx.answerCallbackQuery({
            text: "خطا: سرویس منقضی شده یا حجم به پایان رسیده است. اگر فکر میکنید این یک خطا است، دوباره اقدام کنید!",
            show_alert: true,
        });
        await ctx.deleteMessage();
        return;
    }

    const usedBytes = stats.up + stats.down;
    const remainingBytes = stats.total - usedBytes;
    const formattedStats = {
        upload: formatBytes(stats.up),
        download: formatBytes(stats.down),
        total: formatBytes(stats.total),
        used: formatBytes(usedBytes),
        remaining: formatBytes(remainingBytes),
        expire: calculateTimeRemaining(stats.expiryTime),
        lastOnline:
            stats.lastOnline === 0
                ? "هنوز متصل نشده"
                : convertTimestampToFarsiDate(stats.lastOnline),
    };

    let status: "PENDING" | "ACTIVE" | "EXPIRED" = "PENDING";
    let statusEmoji = "🟡";
    let statusText = "در انتظار اتصال";

    if (formattedStats.expire.isExpired) {
        status = "EXPIRED";
        statusEmoji = "🔴";
        statusText = "منقضی شده";
    } else if (
        !formattedStats.expire.isExpired &&
        (formattedStats.expire.days > 0 || formattedStats.expire.hours > 0)
    ) {
        status = "ACTIVE";
        statusEmoji = "🟢";
        statusText = "فعال";
    }

    const percentUsed = Math.min(
        100,
        Math.round((usedBytes / stats.total) * 100),
    );

    const progressBar = generateProgressBar(percentUsed);

    const detailsText = `
📄 *مشخصات سرویس شما*

🔸 *نام:* ${subscription.clientEmail}
➖➖➖➖➖➖➖➖➖➖
⚙️ *وضعیت:* ${statusText} ${statusEmoji}
➖➖➖➖➖➖➖➖➖➖
📊 *گزارش مصرف لحظه‌ای:*
💾 *حجم کل:* ${formattedStats.total}
📉 **مصرف شده:** ${formattedStats.used}
📈 **باقی‌مانده:** ${formattedStats.remaining}
${progressBar} (${percentUsed}%)


🗓 *زمان باقیمانده:* ${status === "ACTIVE" ? `${formattedStats.expire.days} روز دیگر` : `${subscription.plan.periodDay} روز از اولین اتصال`}

🗓 *آخرین اتصال:* ${formattedStats.lastOnline}

➖➖➖➖➖➖➖➖➖➖
🌍 *لینک اتصال به سرویس:* ${`\n\n\`${subscription.connection}\``}

    `;

    const detailKeyboard = new InlineKeyboard();
    detailKeyboard
        .text("🖨 دریافت کیوآر کد", `get_config_qrcode:${subscription.id}`)
        .row()
        .text("🆙 به روز رسانی لینک", `update_config_link:${subscription.id}`)
        .row()
        .text("➡️ بازگشت به لیست", "back_to_services_list");

    await ctx.editMessageText(detailsText, {
        reply_markup: detailKeyboard,
        parse_mode: "Markdown",
    });

    await ctx.answerCallbackQuery();
});

userHandler.callbackQuery(/^get_config_qrcode:(.+)/, async (ctx) => {
    const subId = ctx.match[1]!;
    const sub = await db.subscription.findFirst({
        where: { id: Number(subId) },
        select: { connection: true },
    });

    if (!sub) {
        await ctx.answerCallbackQuery({
            text: "خطا: کانکشن برای ساخت Qrcode پیدا نشد!",
            show_alert: true,
        });
        return;
    }

    const loadingMessage = await ctx.reply("در ساخت Qrcode مورد نظر...");
    try {
        const qrBuffer = await generateQRCodeBuffer(sub.connection);
        await ctx.replyWithPhoto(new InputFile(qrBuffer, "config-qr.png"), {
            caption: `لینک کپی:\n\`${sub.connection}\`\n\n📱 برای استفاده، کافیست این بارکد را در نرم‌افزار خود (مانند V2rayNG) اسکن کنید.`,
            parse_mode: "Markdown",
        });
        await ctx.api.deleteMessage(
            loadingMessage.chat.id,
            loadingMessage.message_id,
        );
    } catch (error) {
        await ctx.api.editMessageText(
            loadingMessage.chat.id,
            loadingMessage.message_id,
            "❌ متأسفانه در تولید بارکد مشکلی پیش آمد. دوباره اقدام کنید.",
        );
    }
});

userHandler.callbackQuery(/^update_config_link:(.+)/, async (ctx) => {
    const subId = ctx.match[1]!;

    const sub = await db.subscription.findFirst({
        where: { id: Number(subId) },
    });

    if (!sub) {
        await ctx.answerCallbackQuery({
            text: "خطا: کانکشن برای آپدیت پیدا نشد. دوباره تلاش کنید!",
            show_alert: true,
        });
        return;
    }

    const loadingMessage = await ctx.reply("در حال ساخت آپدیت لینک...");

    try {
        const apiClient = new APIClient();
        const inboundObj = await apiClient.getInbound();
        const link = generateDynamicLink(
            {
                id: sub.clientUUID,
                email: sub.clientEmail,
                flow: "",
            },
            inboundObj,
        );
        await db.subscription.update({
            where: { id: sub.id },
            data: { connection: link },
        });
        await ctx.reply(
            `لینک [جدید]:\n\`${sub.connection}\`\n\n📱 برای استفاده، کافیست این لینک را در نرم‌افزار خود (مانند V2rayNG) قرار دهید.`,
            {
                parse_mode: "Markdown",
            },
        );
        await ctx.api.deleteMessage(
            loadingMessage.chat.id,
            loadingMessage.message_id,
        );
    } catch (error) {
        await ctx.api.editMessageText(
            loadingMessage.chat.id,
            loadingMessage.message_id,
            "❌ متأسفانه در آپدیت لینک مشکلی پیش آمد. دوباره اقدام کنید.",
        );
        return;
    }
});

userHandler.callbackQuery("back_to_services_list", async (ctx) => {
    const telegramId = ctx.from!.id;

    const user = await db.user.findUnique({
        where: { telegramId: BigInt(telegramId) },
        include: {
            subscriptions: {
                include: { plan: true },
            },
        },
    });

    if (!user || !user.subscriptions || user.subscriptions.length === 0) {
        await ctx.reply("شما تاکنون هیچ سرویسی خریداری نکرده‌اید.");
        return;
    }

    const keyboard = new InlineKeyboard();

    user.subscriptions.forEach((sub) => {
        const buttonText = `${sub.clientEmail}`;
        keyboard.text(buttonText, `show_service_details:${sub.id}`).row();
    });

    await ctx.editMessageText("📍 برای دیدن مشخصات سرویس روی آن بزنید👇", {
        reply_markup: keyboard,
    });
    await ctx.answerCallbackQuery();
});
