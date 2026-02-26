import { bot } from "./bot";

async function main() {
    try {
        await bot.api.deleteWebhook();
        bot.start();
        console.info("🤖 Bot is running...");
    } catch (error) {
        console.error("Error in starting bot:", error);
    }
}
main();
