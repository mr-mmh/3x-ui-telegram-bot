import { InlineKeyboard } from "grammy";
import type { BotContext, BotConversation } from "./types";
import db from "@/db";
import { CARD_NAME, CARD_NUMBER } from "./constants";
import { APIClient } from "@/lib/api-client";
import { generateID } from "@/lib/id";
import { generateDynamicLink } from "@/lib/link";
export async function clearLastInlineKeyboard(
    ctx: BotContext,
    lastMsgId?: number,
) {
    if (lastMsgId && ctx.chat?.id) {
        try {
            await ctx.api.editMessageReplyMarkup(ctx.chat.id, lastMsgId, {
                reply_markup: { inline_keyboard: [] },
            });
        } catch (e) {}
    }
}

export async function askForText(args: {
    question: string;
    ctx: BotContext;
    conversation: BotConversation;
    allowSkip?: boolean;
    allowCancel?: boolean;
    clearLastKeyboard?: boolean;
    lastMsgId?: number;
}): Promise<{ text: string | null; lastMsgId: number }> {
    let {
        question,
        allowSkip = false,
        clearLastKeyboard = false,
        lastMsgId,
        ctx,
        conversation,
        allowCancel,
    } = args;

    if (clearLastKeyboard && lastMsgId) {
        await clearLastInlineKeyboard(ctx, lastMsgId);
    }

    const activeKeyboard = allowSkip || allowCancel;
    let keyboard: InlineKeyboard | null = null;
    if (activeKeyboard) {
        keyboard = new InlineKeyboard();
        if (allowSkip) {
            keyboard.text("⏭ رد کردن (Skip)", "skip_step").row();
        }
        if (allowCancel) {
            keyboard.text("❌ انصراف", "cancel_operation");
        }
    }

    const msg = await ctx.reply(
        question,
        keyboard
            ? { reply_markup: keyboard, parse_mode: "Markdown" }
            : { parse_mode: "Markdown" },
    );
    args.lastMsgId = msg.message_id;

    const newCtx = await conversation.wait();

    if (newCtx.callbackQuery?.data) {
        const data = newCtx.callbackQuery.data;

        if (data === "cancel_operation" && allowCancel) {
            await newCtx.answerCallbackQuery("عملیات لغو شد 🚫");
            await newCtx.editMessageText("❌ عملیات لغو شد.");
            return {
                text: null,
                lastMsgId: args.lastMsgId,
            };
        }

        if (data === "skip_step" && allowSkip) {
            await newCtx.answerCallbackQuery("مرحله رد شد ⏭");
            return {
                text: "SKIP",
                lastMsgId: args.lastMsgId,
            };
        }
    }

    if (newCtx.message?.text) {
        return {
            text: newCtx.message.text.trim(),
            lastMsgId: args.lastMsgId,
        };
    }

    await ctx.reply("لطفاً فقط متن ارسال کنید یا از دکمه‌ها استفاده کنید.");
    return askForText(args);
}

export async function askForSelection(args: {
    text: string;
    ctx: BotContext;
    conversation: BotConversation;
    keyboard: InlineKeyboard;
    lastMsgId?: number;
    clearLastKeyboard?: boolean;
    cancelKey?: string;
}): Promise<{ text: string | null; lastMsgId: number }> {
    let {
        text,
        lastMsgId,
        ctx,
        conversation,
        clearLastKeyboard,
        keyboard,
        cancelKey = "cancel_operation",
    } = args;

    if (clearLastKeyboard && lastMsgId) {
        await clearLastInlineKeyboard(ctx, lastMsgId);
    }

    const msg = await ctx.reply(text, {
        reply_markup: keyboard,
        parse_mode: "Markdown",
    });
    args.lastMsgId = msg.message_id;

    const newCtx = await conversation.wait();

    // اگر کاربر روی دکمه زد
    if (newCtx.callbackQuery?.data) {
        const data = newCtx.callbackQuery.data;

        // اگر دکمه انصراف بود
        if (data === cancelKey) {
            await newCtx.answerCallbackQuery("عملیات لغو شد 🚫");
            await newCtx.editMessageText("❌ عملیات لغو شد.");
            return {
                text: null,
                lastMsgId: args.lastMsgId,
            };
        }

        await newCtx.answerCallbackQuery();
        return {
            text: data,
            lastMsgId: args.lastMsgId,
        };
    }

    await ctx.reply("لطفاً یکی از گزینه‌ها را انتخاب کنید 👇");
    return askForSelection(args);
}

export async function processPurchase(userId: number, planId: number) {
    return await db.$transaction(async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        const plan = await tx.plan.findUniqueOrThrow({ where: { id: planId } });

        console.log("user", user);
        console.log("plan", plan);
        if (user.balance < plan.price) {
            throw new Error("INSUFFICIENT_BALANCE");
        }

        await tx.user.update({
            where: { id: userId },
            data: {
                balance: { decrement: plan.price },
            },
        });

        await tx.walletTransaction.create({
            data: {
                userId: userId,
                amount: -plan.price, // مبلغ منفی نشان‌دهنده کسر است
                type: "PURCHASE", // نوع تراکنش (اگر Enum دارید استفاده کنید)
                description: `خرید سرویس ${plan.name}`,
            },
        });

        const order = await tx.order.create({
            data: {
                userId: userId,
                planId: planId,
                amount: plan.price,
            },
        });

        const apiClient = new APIClient();

        const inboundObj = await apiClient.getInbound();
        const createdClient = await apiClient.addClient(
            `PLAN:${plan.capacityGB}GB|${plan.periodDay}D|${generateID(8)}`,
            plan.capacityGB,
            plan.periodDay,
        );
        const link = generateDynamicLink(createdClient, inboundObj);

        const subscription = await tx.subscription.create({
            data: {
                clientEmail: createdClient.email,
                clientUUID: createdClient.id,
                subId: createdClient.subId,
                connection: link,
                planId: plan.id,
                userId: user.id,
            },
        });
        return { plan, subscription };
    });
}

export function getCardInfoMsg({
    amount,
    type,
}: {
    amount: number;
    type: "CHARGE" | "BUY";
}) {
    const msg = `
💳 *اطلاعات پرداخت* -  ${type === "BUY" ? "خرید سرویس" : "شارژ کیف پول"}

لطفاً مبلغ *${amount.toLocaleString("fa-IR")} تومان* را به شماره کارت زیر واریز کنید:

\`${CARD_NUMBER}\`
👤 به نام: *${CARD_NAME}*

📸 *مهم:* پس از واریز، لطفاً *عکس رسید (اسکرین‌شات)* را همینجا ارسال کنید ${type === "BUY" ? "تا اکانت شما شارژ شود و سرویس خودکار فعال شود." : "تا کیف پول شما شارژ شود"}

⚠️ *توجه:* این فرایند ممکن است حداکثر تا ۵ دقیقه طول بکشد چون تایید دستی انجام میشود!
    `;

    return msg;
}
