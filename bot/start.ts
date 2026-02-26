import db from "@/db";
import type { BotType } from "./types";
import { ADMIN_ID } from "./constants";
import { showAdminMenu } from "./admin/menu";
import { showUserMenu } from "./user/menu";

export const registerStartCommand = (bot: BotType) => {
    bot.command("start", async (ctx) => {
        if (!ctx.from) return;
        const telegramId = BigInt(ctx.from.id);

        try {
            await db.user.upsert({
                where: { telegramId },
                update: {
                    username: ctx.from.username,
                    firstName: ctx.from.first_name,
                },
                create: {
                    telegramId,
                    username: ctx.from.username,
                    firstName: ctx.from.first_name,
                },
            });
        } catch (e) {
            console.error(e);
        }

        if (telegramId === ADMIN_ID) {
            await ctx.reply(`سلام ادمین عزیز! 👑`);
            await showAdminMenu(ctx);
        } else {
            await showUserMenu(ctx);
        }
    });
};
