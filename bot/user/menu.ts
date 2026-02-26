import { Keyboard } from "grammy";
import type { BotContext } from "../types";

export const USER_MENU = {
    buyService: "🛒 خرید سرویس جدید",
    myServices: "🛍 سرویس های من",
    wallet: "💰کیف پول",
    support: "☎️ پشتیبانی",
    help: "📚 آموزش",
};

export async function showUserMenu(
    ctx: BotContext,
    text: string = "سلام خوش آمدید ⬇️",
) {
    const keyboard = new Keyboard()
        .text(USER_MENU.buyService)
        .row()
        .text(USER_MENU.myServices)
        .text(USER_MENU.wallet)
        .row()
        .text(USER_MENU.help)
        .text(USER_MENU.support)
        .row()
        .resized();

    await ctx.reply(text, { reply_markup: keyboard });
}
