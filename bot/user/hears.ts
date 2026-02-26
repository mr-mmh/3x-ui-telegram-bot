import db from "@/db";
import type { BotContext } from "../types";
import { InlineKeyboard } from "grammy";

export const myServiceHears = async (ctx: BotContext) => {
    const telegramId = ctx.from!.id;

    const user = await db.user.findUnique({
        where: { telegramId: BigInt(telegramId) },
        include: {
            subscriptions: { include: { plan: true } },
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

    await ctx.reply("📍 برای دیدن مشخصات سرویس روی آن بزنید👇", {
        reply_markup: keyboard,
    });
};

export async function walletHears(ctx: BotContext) {
    const user = await db.user.findUnique({
        where: { telegramId: BigInt(ctx.from!.id) },
    });

    if (!user) {
        await ctx.reply("ابتدا باید با دستور /start ربات را فعال کنید.");
        return;
    }

    const balance = user.balance.toLocaleString("fa-IR");
    const text = `💳 *کیف پول شما*\n\nموجودی فعلی: *${balance} تومان*`;

    const keyboard = new InlineKeyboard().text(
        "💵 افزایش موجودی",
        "charge_wallet",
    );

    await ctx.reply(text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
    });
}
