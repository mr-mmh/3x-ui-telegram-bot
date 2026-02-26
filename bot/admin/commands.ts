import { ADMIN_ID } from "../constants";
import type { BotType } from "../types";
import { ADMIN_MENU, showAdminMenu } from "./menu";
import { showUserMenu } from "../user/menu";
import { depositeReqHears, listPlanHears, statsHears } from "./hears";

export const registerAdminCommand = (bot: BotType) => {
    bot.command("admin", async (ctx) => {
        if (!ctx.from || BigInt(ctx.from.id) !== ADMIN_ID) {
            await ctx.reply(
                "🚫 زهی خیال باطل. شما کاربر معمولی هستید عزیز جان 🚨",
            );
            await showUserMenu(ctx);
            return;
        }
        await showAdminMenu(ctx);
    });

    bot.hears(ADMIN_MENU.addPlan, async (ctx) => {
        if (!ctx.from || BigInt(ctx.from.id) !== ADMIN_ID) return;
        await ctx.conversation.enter("createPlanConversation");
    });

    bot.hears(ADMIN_MENU.depositeReq, depositeReqHears);

    bot.hears(ADMIN_MENU.exit, async (ctx) => {
        await ctx.reply("از پنل مدیریت خارج شدید.", {
            reply_markup: { remove_keyboard: true },
        });
    });
    bot.hears(ADMIN_MENU.listPlan, listPlanHears);
    bot.hears(ADMIN_MENU.stats, statsHears);
};
