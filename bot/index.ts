import { conversations, createConversation } from "@grammyjs/conversations";
import { Bot, session } from "grammy";
import type { BotContext } from "./types";
import { createPlanConversation } from "./admin/conversations";
import { registerStartCommand } from "./start";
import { registerAdminCommand } from "./admin/commands";
import { registerUserCommand } from "./user/commands";
import {
    buyServiceStepsConversation,
    chargeWalletConversation,
} from "./user/conversations";
import { adminPaymentHandler } from "./admin/handlers";
import { userHandler } from "./user/handlers";
import { USER_MENU } from "./user/menu";

if (!process.env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is not defined in .env file");
}

const bot = new Bot<BotContext>(process.env.BOT_TOKEN);

const GLOBAL_COMMANDS = Object.values(USER_MENU);
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());
// help to jump from but conversation to menu
bot.use(async (ctx, next) => {
    const text = ctx.message?.text;

    if (
        text &&
        ctx.conversation.active()?.buyServiceStepsConversation &&
        GLOBAL_COMMANDS.includes(text)
    ) {
        await ctx.conversation.exitAll();
        await ctx.reply(`عملیات قبلی لغو شد. در حال نمایش "${text}"...`);
    }
    await next();
});
bot.use(createConversation(createPlanConversation));
bot.use(createConversation(buyServiceStepsConversation));
bot.use(createConversation(chargeWalletConversation));
bot.use(adminPaymentHandler);
bot.use(userHandler);

registerStartCommand(bot);
registerAdminCommand(bot);
registerUserCommand(bot);

bot.api.setMyCommands([{ command: "start", description: "شروع مجدد" }]);

bot.catch((err) => console.error("ERROR IN BOT:", err));

export { bot };
