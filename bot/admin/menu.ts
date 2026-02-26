import { Keyboard } from "grammy";
import type { BotContext } from "../types";

export const ADMIN_MENU = {
    addPlan: "➕ افزودن پلن",
    listPlan: "📂 لیست پلن‌ها",
    depositeReq: "📝 فیش های واریز",
    stats: "📝 گزارش وضعیت",
    exit: "🔙 خروج از پنل مدیریت",
};

export async function showAdminMenu(
    ctx: BotContext,
    text: string = "ادمین عزیز، گزینه از منو انتخاب کنید ⬇️",
) {
    const keyboard = new Keyboard()
        .text(ADMIN_MENU.depositeReq)
        .text(ADMIN_MENU.addPlan)
        .row()
        .text(ADMIN_MENU.stats)
        .text(ADMIN_MENU.listPlan)
        .row()
        .text(ADMIN_MENU.exit)
        .row()
        .resized();

    await ctx.reply(text, { reply_markup: keyboard });
}
