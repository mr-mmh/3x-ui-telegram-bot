import { type BotConversationBuilder } from "../types";
import db from "@/db";
import { askForText, clearLastInlineKeyboard } from "../helpers";

export const createPlanConversation: BotConversationBuilder = async (
    conversation,
    ctx,
) => {
    let lastMsgId: number | undefined;

    const c = {
        question: "",
        ctx,
        conversation,
        allowCancel: true,
        clearLastKeyboard: true,
        lastMsgId,
    };

    c.question = "📝 نام پلن را وارد کنید:\n(مثال: سرویس ۱ ماهه ۳۰ گیگ)";
    const { text: name } = await askForText(c);
    if (name === null) return;

    c.question = "💰 قیمت را به تومان وارد کنید (فقط عدد):\n(مثال: 150000)";
    const { text: priceStr } = await askForText(c);
    if (priceStr === null) return;
    const price = parseInt(priceStr);
    if (isNaN(price)) {
        await clearLastInlineKeyboard(ctx, lastMsgId);
        await ctx.reply("❌ قیمت باید عدد باشد. عملیات متوقف شد.");
        return;
    }

    c.question = "📦 حجم پلن را به گیگابایت وارد کنید:\n(مثال: 30)";
    const { text: gbStr } = await askForText(c);
    if (gbStr === null) return;
    const gb = parseInt(gbStr);

    c.question = "⏳ مدت زمان را به روز وارد کنید:\n(مثال: 30)";
    const { text: dayStr } = await askForText(c);
    if (dayStr === null) return;
    const days = parseInt(dayStr);

    c.question = "👥 محدودیت تعداد کاربر (مثال: 1 یا 2):";
    const { text: userNumStr, lastMsgId: last } = await askForText(c);
    if (userNumStr === null) return;
    const userNum = parseInt(userNumStr);

    await clearLastInlineKeyboard(ctx, last);
    await ctx.reply("🔄 در حال ذخیره پلن...");

    try {
        await conversation.external(async () => {
            await db.plan.create({
                data: {
                    name: name,
                    price: price,
                    capacityGB: gb,
                    periodDay: days,
                    userLimit: userNum,
                    description: `${gb} گیگابایت - ${days} روزه`,
                },
            });
        });
        await ctx.reply(`✅ پلن "${name}" با موفقیت ساخته شد!`);
    } catch (e) {
        console.error(e);
        await ctx.reply("❌ خطا در ذخیره پلن.");
    }
};
