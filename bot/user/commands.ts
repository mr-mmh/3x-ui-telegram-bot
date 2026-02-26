import type { BotType } from "../types";
import { myServiceHears, walletHears } from "./hears";
import { USER_MENU } from "./menu";

export const registerUserCommand = (bot: BotType) => {
    bot.hears(USER_MENU.buyService, async (ctx) => {
        await ctx.conversation.enter("buyServiceStepsConversation");
    });

    bot.hears(USER_MENU.myServices, myServiceHears);

    bot.hears(USER_MENU.wallet, walletHears);

    bot.callbackQuery("charge_wallet", async (ctx) => {
        await ctx.answerCallbackQuery();
        await ctx.conversation.enter("chargeWalletConversation");
    });

    bot.hears(USER_MENU.support, async (ctx) => {
        await ctx.reply("هنوز پیاده سازی نشده");
    });

    bot.hears(USER_MENU.help, async (ctx) => {
        await ctx.reply("هنوز پیاده سازی نشده");
    });
};
