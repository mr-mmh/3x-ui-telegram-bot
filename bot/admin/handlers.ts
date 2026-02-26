import { Composer } from "grammy";
import db from "@/db";
import { processPurchase } from "../helpers";

export const adminPaymentHandler = new Composer();

adminPaymentHandler.callbackQuery(/^admin_approve_pay:(\d+)$/, async (ctx) => {
    const paymentId = parseInt(ctx.match[1]!);
    await ctx.answerCallbackQuery("⏳ در حال پردازش...");

    try {
        const payment = await db.payment.findUnique({
            where: { id: paymentId },
            include: { user: true },
        });
        if (!payment) {
            await ctx.reply("❌ تراکنش یافت نشد.");
            return;
        }
        if (payment.status !== "PENDING") {
            await ctx.answerCallbackQuery(
                "⚠️ وضعیت این تراکنش قبلاً تغییر کرده است.",
            );
            await ctx.editMessageCaption({
                caption: `⚠️ این درخواست قبلاً ${
                    payment.status === "APPROVED" ? "تأیید" : "رد"
                } شده است.`,
            });
            return;
        }

        await ctx.answerCallbackQuery("⏳ در حال پردازش...");
        let gift = 0;
        if (payment.metadata) {
            const meta =
                typeof payment.metadata === "string"
                    ? JSON.parse(payment.metadata)
                    : (payment.metadata as any);
            if (meta.gift && typeof meta.gift === "number" && meta.gift > 0) {
                gift = meta.gift;
            }
        }

        await db.$transaction(async (tx) => {
            const updatedPayment = await tx.payment.updateMany({
                where: { id: paymentId, status: "PENDING" },
                data: {
                    status: "APPROVED",
                    processedAt: new Date(),
                },
            });

            if (updatedPayment.count === 0) {
                throw new Error("TRANSACTION_ALREADY_PROCESSED");
            }

            await tx.user.update({
                where: { id: payment.userId },
                data: {
                    balance: { increment: payment.amount + gift },
                },
            });

            await tx.walletTransaction.create({
                data: {
                    userId: payment.userId,
                    amount: payment.amount + gift, // مثبت برای واریز
                    type: "DEPOSIT",
                    description: `شارژ کیف پول (تایید دستی رسید ${paymentId})`,
                },
            });
        });

        await ctx.editMessageCaption({
            caption: `✅ **تأیید شد**\n\n👤 کاربر: ${payment.user.telegramId}\n💰 مبلغ: ${payment.amount.toLocaleString()} تومان شارژ شد.`,
        });

        await ctx.api.sendMessage(
            String(payment.user.telegramId),
            `✅ **پرداخت شما تأیید شد!**\n\n💰 مبلغ ${payment.amount.toLocaleString()} تومان به کیف پول شما اضافه شد. ${gift == 0 ? "" : `\n\nهمچنین مبلغ ${gift.toLocaleString("fa-IR")} تومان بیشتر به عنوان هدیه خرید سرویس جدید کیف پول شما شارژ شد.`}`,
        );

        if (payment.metadata) {
            const meta =
                typeof payment.metadata === "string"
                    ? JSON.parse(payment.metadata)
                    : (payment.metadata as any);

            if (meta?.action === "BUY_PLAN" && meta?.planId) {
                try {
                    const result = await processPurchase(
                        payment.userId,
                        meta.planId,
                    );
                    const { plan, subscription } = result;
                    let summaryMsg = `🎉 **سرویس شما با موفقیت فعال شد!**\n\n`;
                    summaryMsg += `📦 سرویس: ${plan.name}\n`;
                    summaryMsg += `⏳ اعتبار: ${plan.periodDay} روز\n\n`;
                    summaryMsg += `👇 **لینک‌های اتصال شما به صورت جداگانه در ادامه ارسال می‌شوند:**`;

                    await ctx.api.sendMessage(
                        String(payment.user.telegramId),
                        summaryMsg,
                        { parse_mode: "Markdown" },
                    );

                    const urlMsg = `🌍 *لینک کانکشن*\n\n\`${subscription.connection}\``;

                    await ctx.api.sendMessage(
                        String(payment.user.telegramId),
                        urlMsg,
                        { parse_mode: "Markdown" },
                    );

                    await ctx.reply(
                        `🤖 خرید خودکار برای کاربر انجام شد (پلن ID: ${meta.planId}).`,
                    );
                } catch (error: any) {
                    console.error("error:", error);
                    let failMsg =
                        "⚠️ حساب شما شارژ شد، اما فعال‌سازی خودکار سرویس انجام نشد ";

                    if (error.message === "INSUFFICIENT_BALANCE") {
                        failMsg += "(موجودی ناکافی - خطای عجیب!).";
                    } else if (error.message === "OUT_OF_STOCK") {
                        failMsg += "(موجودی پلن تمام شده است).";
                    } else {
                        failMsg += "(خطای سیستم).";
                    }

                    failMsg +=
                        "\nلطفاً از منوی ربات مجدداً برای خرید اقدام کنید (موجودی شما محفوظ است).";

                    await ctx.api.sendMessage(
                        String(payment.user.telegramId),
                        failMsg,
                    );
                }
            }
        }
    } catch (e: any) {
        if (e.message === "TRANSACTION_ALREADY_PROCESSED") {
            await ctx.answerCallbackQuery("⚠️ قبلاً پردازش شده است.");
            return;
        }
        console.error("Error in approve payment:", e);
        await ctx.reply("❌ خطا در پردازش تأیید پرداخت.");
    }
});

adminPaymentHandler.callbackQuery(/^admin_reject_pay:(\d+)$/, async (ctx) => {
    const paymentId = parseInt(ctx.match[1]!);

    try {
        const payment = await db.payment.findUnique({
            where: { id: paymentId },
            include: { user: true },
        });
        if (!payment) {
            await ctx.answerCallbackQuery("❌ تراکنش یافت نشد.");
            return;
        }

        if (payment.status !== "PENDING") {
            await ctx.answerCallbackQuery("⚠️ وضعیت تغییر کرده است.");
            await ctx.editMessageCaption({
                caption: `⚠️ وضعیت این پرداخت قبلاً مشخص شده است (${payment.status}).`,
            });
            return;
        }

        await db.payment.update({
            where: { id: paymentId },
            data: {
                status: "REJECTED",
                processedAt: new Date(),
            },
        });

        await ctx.answerCallbackQuery("❌ پرداخت رد شد.");

        await ctx.editMessageCaption({
            caption: `❌ **رد شد**\nاین پرداخت توسط ادمین رد شد.`,
        });

        await ctx.api.sendMessage(
            String(payment.user.telegramId),
            "❌ پرداخت شما توسط مدیریت رد شد.\nدر صورت اشتباه، لطفاً با پشتیبانی تماس بگیرید.",
        );
    } catch (e) {
        console.error("Error in reject payment:", e);
        await ctx.reply("❌ خطا در رد کردن پرداخت.");
    }
});

adminPaymentHandler.callbackQuery(
    /admin_approve_deposit:(\d+)/,
    async (ctx) => {
        const paymentId = parseInt(ctx.match[1]!);
        await ctx.answerCallbackQuery("⏳ در حال پردازش...");

        try {
            const payment = await db.payment.findUnique({
                where: { id: paymentId },
                include: { user: true },
            });
            if (!payment) {
                await ctx.reply("❌ تراکنش یافت نشد.");
                return;
            }

            if (payment.status !== "PENDING") {
                await ctx.answerCallbackQuery(
                    "⚠️ وضعیت این تراکنش قبلاً تغییر کرده است.",
                );
                await ctx.editMessageCaption({
                    caption: `⚠️ این درخواست قبلاً ${
                        payment.status === "APPROVED" ? "تأیید" : "رد"
                    } شده است.`,
                });
                return;
            }

            await db.$transaction(async (tx) => {
                const updatedPayment = await tx.payment.updateMany({
                    where: { id: paymentId, status: "PENDING" },
                    data: {
                        status: "APPROVED",
                        processedAt: new Date(),
                    },
                });

                if (updatedPayment.count === 0) {
                    throw new Error("TRANSACTION_ALREADY_PROCESSED");
                }

                await tx.user.update({
                    where: { id: payment.userId },
                    data: {
                        balance: { increment: payment.amount },
                    },
                });

                await tx.walletTransaction.create({
                    data: {
                        userId: payment.userId,
                        amount: payment.amount,
                        type: "DEPOSIT",
                        description: `شارژ کیف پول (تایید دستی رسید ${paymentId})`,
                        paymentId,
                    },
                });
            });

            const userMsg = `✅ درخواست شارژ کیف پول شما به مبلغ ${payment.amount.toLocaleString("fa-IR")} تومان تایید شد. موجودی جدید شما: ${(payment.user.balance + payment.amount).toLocaleString("fa-IR")} تومان.`;
            await ctx.api.sendMessage(String(payment.user.telegramId), userMsg);

            await ctx.editMessageCaption({
                caption: `${ctx.callbackQuery.message?.caption}\n\n✅ توسط شما تایید شد.`,
            });
            await ctx.answerCallbackQuery("✅ با موفقیت تایید شد.");
        } catch (e: any) {
            if (e.message === "TRANSACTION_ALREADY_PROCESSED") {
                await ctx.answerCallbackQuery("⚠️ قبلاً پردازش شده است.");
                return;
            }
            console.error("Error in approve deposit:", e);
            await ctx.reply("❌ خطا در پردازش تأیید شارژ کیف پول.");
        }
    },
);

adminPaymentHandler.callbackQuery(/admin_reject_deposit:(\d+)/, async (ctx) => {
    const paymentId = parseInt(ctx.match[1]!);
    await ctx.answerCallbackQuery("⏳ در حال پردازش...");

    try {
        const payment = await db.payment.findUnique({
            where: { id: paymentId },
            include: { user: true },
        });
        if (!payment) {
            await ctx.answerCallbackQuery("❌ تراکنش یافت نشد.");
            return;
        }

        if (payment.status !== "PENDING") {
            await ctx.answerCallbackQuery("⚠️ وضعیت تغییر کرده است.");
            await ctx.editMessageCaption({
                caption: `⚠️ وضعیت این پرداخت قبلاً مشخص شده است (${payment.status}).`,
            });
            return;
        }

        await db.payment.update({
            where: { id: paymentId },
            data: {
                status: "REJECTED",
                processedAt: new Date(),
            },
        });

        await ctx.answerCallbackQuery("❌ پرداخت رد شد.");
        await ctx.editMessageCaption({
            caption: `❌ **رد شد**\nاین پرداخت توسط ادمین رد شد.`,
        });
        await ctx.api.sendMessage(
            String(payment.user.telegramId),
            `❌ درخواست شارژ شما به مبلغ ${payment.amount.toLocaleString("fa-IR")} تومان رد شد. لطفاً با پشتیبانی در تماس باشید.`,
        );
    } catch (e) {
        console.error("Error in reject payment:", e);
        await ctx.reply("❌ خطا در رد کردن پرداخت.");
    }
});
