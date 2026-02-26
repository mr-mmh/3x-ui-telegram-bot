import db from "@/db";
import type { BotConversationBuilder } from "../types";
import { InlineKeyboard } from "grammy";
import { processPurchase, getCardInfoMsg } from "../helpers";
import { ADMIN_ID } from "../constants";
import type { Plan } from "@/generated/prisma/client";

type Stage =
    | "SELECT_PLAN"
    | "SHOW_INVOICE"
    | "AWAIT_PAYMENT_PROOF"
    | "COMPLETED";
export const buyServiceStepsConversation: BotConversationBuilder = async (
    conversation,
    ctx,
) => {
    const plans = await conversation.external(() =>
        db.plan.findMany({
            orderBy: { price: "asc" },
        }),
    );

    if (plans.length === 0) {
        await ctx.reply("😔 فعلا هیچ پلنی برای فروش موجود نیست.");
        return;
    }

    let stage = "SELECT_PLAN" as Stage;
    let selectedPlan: Plan | undefined;
    let mainMessageId: number | undefined;
    let gift: number = 0;

    while (stage !== "COMPLETED") {
        const user = await conversation.external(() =>
            db.user.findUnique({
                where: { telegramId: BigInt(ctx.from?.id!) },
            }),
        );
        if (!user) {
            await ctx.reply("خطا: کاربر یافت نشد.");
            return;
        }
        const userBalance = Number(user.balance);

        // --- مرحله ۱: انتخاب پلن ---
        if (stage === "SELECT_PLAN") {
            const text = `
            🛍 *خرید سرویس*

🎁 *هدیه ویژه:* با خرید هر سرویس جدید ۱۰٪ از مبلغ پرداختی در کیف پول شما شارژ می شود.

لطفاً یکی از پلن‌های زیر را انتخاب کنید ⬇️
            `;
            const keyboard = new InlineKeyboard();
            plans.forEach((p) => {
                keyboard
                    .text(
                        `📦 ${p.name} | ${p.price.toLocaleString("fa-IR")} تومان`,
                        `select_plan:${p.id}`,
                    )
                    .row();
            });
            keyboard.text("❌ انصراف", "cancel");

            if (!mainMessageId) {
                const msg = await ctx.reply(text, {
                    reply_markup: keyboard,
                    parse_mode: "Markdown",
                });
                mainMessageId = msg.message_id;
            } else {
                await ctx.api.editMessageText(
                    ctx.chat!.id,
                    mainMessageId,
                    text,
                    {
                        reply_markup: keyboard,
                        parse_mode: "Markdown",
                    },
                );
            }

            const response = await conversation.wait();

            const data = response.callbackQuery?.data;

            if (data) {
                if (data === "cancel") break;

                if (data.startsWith("select_plan:")) {
                    const planId = parseInt(data.split(":")[1]!);
                    selectedPlan = plans.find((p) => p.id === planId);
                    if (selectedPlan) {
                        stage = "SHOW_INVOICE"; // برو به مرحله بعد
                    }
                }
            } else {
                break;
            }
        }

        // --- مرحله ۲: نمایش پیش‌فاکتور ---
        if (stage === "SHOW_INVOICE" && selectedPlan) {
            const price = Number(selectedPlan.price);
            const deficit = price - userBalance;
            const isBalanceSufficient = userBalance >= price;
            gift = price * 0.1;

            const invoiceText =
                `🧾 *پیش‌فاکتور خرید*\n\n` +
                `📦 *سرویس:* ${selectedPlan.name}\n` +
                `⏳ *مدت:* ${selectedPlan.periodDay} روز\n` +
                `💾 *حجم:* ${selectedPlan.capacityGB} گیگابایت\n\n` +
                `💰 *قیمت پلن:* ${price.toLocaleString("fa-IR")} تومان\n` +
                `💳 *موجودی کیف پول:* ${userBalance.toLocaleString("fa-IR")} تومان\n\n` +
                (isBalanceSufficient
                    ? "✅ موجودی شما کافی است. برای تکمیل خرید، دکمه تایید را بزنید."
                    : `⚠️ موجودی کافی نیست. مبلغ قابل پرداخت: *${deficit.toLocaleString("fa-IR")} تومان*`) +
                (gift == 0
                    ? ""
                    : "\n\n➖➖➖➖➖➖\n" +
                      ` *🎁 هدیه خرید:* ${gift.toLocaleString("fa-IR")} تومان شارژ بیشتر به کیف پول شما افزوده می شود.\n\n`);

            const invoiceKeyboard = new InlineKeyboard();
            if (isBalanceSufficient) {
                invoiceKeyboard.text(
                    "✅ تأیید و فعال‌سازی آنی",
                    "confirm_purchase",
                );
            } else {
                invoiceKeyboard.text(
                    `💳 پرداخت و شارژ (${deficit.toLocaleString("fa-IR")} تومان)`,
                    "pay_and_charge",
                );
            }
            invoiceKeyboard
                .row()
                .text("➡️ بازگشت", "back_to_plans")
                .text("❌ انصراف", "cancel");

            await ctx.api.editMessageText(
                ctx.chat!.id,
                mainMessageId!,
                invoiceText,
                {
                    reply_markup: invoiceKeyboard,
                    parse_mode: "Markdown",
                },
            );

            const response = await conversation.waitFor("callback_query:data");
            const data = response.callbackQuery.data;

            if (data === "cancel") break;
            if (data === "back_to_plans") {
                stage = "SELECT_PLAN";
                continue;
            }

            if (data === "confirm_purchase") {
                // منطق خرید آنی
                try {
                    const result = await conversation.external(async () => {
                        const res = await processPurchase(
                            user.id,
                            selectedPlan!.id,
                        );
                        if (gift > 0) {
                            await db.user.update({
                                where: { id: user.id },
                                data: {
                                    balance: {
                                        increment: gift,
                                    },
                                },
                            });
                        }

                        return res;
                    });
                    const { plan, subscription } = result;
                    await ctx.api.deleteMessage(ctx.chat!.id, mainMessageId!); // پیام اصلی را حذف کن

                    // پیام موفقیت
                    let successMsg =
                        `✅ *خرید با موفقیت انجام شد!*\n\n` +
                        `📦 سرویس: ${plan.name}\n` +
                        `📅 انقضا: ${plan.periodDay} روز دیگر\n` +
                        ` ${gift == 0 ? "" : `\n\nهمچنین مبلغ ${gift.toLocaleString("fa-IR")} تومان بیشتر به عنوان هدیه خرید سرویس جدید کیف پول شما شارژ شد.`}`;
                    await ctx.reply(successMsg, { parse_mode: "Markdown" });

                    // ارسال لینک‌ها
                    const connMsg = `🌍 *لینک اتصال:*\n\`${subscription.connection}\``;
                    await ctx.reply(connMsg, { parse_mode: "Markdown" });

                    stage = "COMPLETED"; // تمام
                } catch (error: any) {
                    await ctx.reply(`❌ خطا در هنگام خرید: ${error.message}`);
                    break;
                }
            }
            if (data === "pay_and_charge") {
                stage = "AWAIT_PAYMENT_PROOF"; // برو به مرحله پرداخت
            }
        }

        if (stage === "AWAIT_PAYMENT_PROOF" && selectedPlan) {
            const deficit = Number(selectedPlan.price) - userBalance;
            const cardKeyboard = new InlineKeyboard()
                .text("➡️ بازگشت", "back_to_invoice")
                .text("❌ انصراف", "cancel");

            try {
                await ctx.api.editMessageText(
                    ctx.chat!.id,
                    mainMessageId!,
                    getCardInfoMsg({
                        amount: deficit,
                        type: "BUY",
                    }),
                    {
                        reply_markup: cardKeyboard,
                        parse_mode: "Markdown",
                    },
                );
            } catch (error) {
                // if we back here and message does not change
            }

            const response = await conversation.wait();

            if (response.callbackQuery?.data === "cancel") break;
            if (response.callbackQuery?.data === "back_to_invoice") {
                stage = "SHOW_INVOICE";
                continue;
            }

            if (response.message?.photo) {
                const photo = response.message.photo.pop()!; // باکیفیت‌ترین عکس

                // ذخیره اطلاعات پرداخت در دیتابیس (Pending)
                const payment = await conversation.external(async () => {
                    return await db.payment.create({
                        data: {
                            userId: user.id,
                            amount: deficit,
                            status: "PENDING",
                            receiptImageId: photo.file_id,
                            // متادیتا برای اینکه ادمین بداند این پول برای کدام پلن بوده
                            metadata: JSON.stringify({
                                action: "BUY_PLAN",
                                planId: selectedPlan!.id,
                                ...(gift > 0 && { gift }),
                            }),
                        },
                    });
                });

                await ctx.reply(
                    "✅ رسید شما دریافت شد. پس از تأیید ادمین، سرویس به صورت خودکار فعال و برای شما ارسال می‌شود.",
                );

                const adminMsg = `
🔔 **درخواست شارژ جدید**

👤 کاربر: ${user.id}
💰 مبلغ: ${deficit.toLocaleString("fa-IR")} تومان
📝 پلن درخواستی: ${selectedPlan.name}

📸 رسید در ادامه:
    `;

                const adminKeyboard = new InlineKeyboard()
                    // ID پرداخت را در دکمه ذخیره می‌کنیم تا بدانیم کدام رکورد را آپدیت کنیم
                    .text("✅ تأیید پرداخت", `admin_approve_pay:${payment.id}`)
                    .text("❌ رد پرداخت", `admin_reject_pay:${payment.id}`);
                await ctx.api.sendMessage(String(ADMIN_ID), adminMsg);
                await ctx.api.sendPhoto(String(ADMIN_ID), photo.file_id, {
                    caption: `رسید کاربر ${user.id}`,
                    reply_markup: adminKeyboard,
                });
                stage = "COMPLETED";
            } else if (response.message) {
                await ctx.reply(
                    "❌ ورودی نامعتبر است.\nلطفاً **فقط عکس رسید پرداخت** را ارسال کنید یا از دکمه‌های زیر استفاده کنید.",
                );
                // continue باعث می‌شود حلقه دوباره از اول همین مرحله (AWAIT_PAYMENT_PROOF) اجرا شود
                // و ربات دوباره منتظر ورودی صحیح بماند.
                continue;
            }
        }
    }

    if (stage !== "COMPLETED") {
        await ctx.reply("❌ عملیات خرید لغو شد.");
    }
    if (mainMessageId) {
        try {
            await ctx.api.deleteMessage(ctx.chat!.id, mainMessageId);
        } catch {
            // پیام ممکن است قبلا حذف شده باشد، مشکلی نیست
        }
    }
};

export const chargeWalletConversation: BotConversationBuilder = async (
    conversation,
    ctx,
) => {
    // --- ۱. دریافت مبلغ از کاربر ---
    const cancelKeyboard = new InlineKeyboard().text(
        "❌ انصراف",
        "cancel_charge",
    );
    const promptMessage = await ctx.reply(
        "💵 لطفاً مبلغ مورد نظر برای شارژ را (به تومان و با اعداد لاتین) وارد کنید.\n\nمثال: 50000\n\n⚠️ حداقل مبلغ ۲۵,۰۰۰ تومان و حداکثر ۱۰,۰۰۰,۰۰۰ تومان است.",
        {
            reply_markup: cancelKeyboard,
        },
    );

    let amount = 0;
    let inputIsValid = false;

    while (!inputIsValid) {
        const responseCtx = await conversation.wait();

        // حالت ۱: کاربر روی دکمه انصراف کلیک کرده است
        if (responseCtx.callbackQuery?.data === "cancel_charge") {
            await ctx.answerCallbackQuery(); // به تلگرام می‌گوید که کلیک دریافت شد
            await ctx.api.deleteMessage(ctx.chat!.id, promptMessage.message_id);
            await ctx.reply("❌ عملیات افزایش موجودی لغو شد.");
            return; // از conversation خارج می‌شویم
        }
        // حالت ۲: کاربر یک پیام متنی فرستاده است
        if (responseCtx.message?.text) {
            const amountInput = parseInt(
                responseCtx.message.text.trim().replace(/,/g, ""),
            );

            if (isNaN(amountInput)) {
                await responseCtx.reply("❌ لطفاً فقط عدد لاتین وارد کنید.");
                continue; // حلقه را ادامه می‌دهیم تا ورودی معتبر بگیریم
            }

            if (amountInput < 25000 || amountInput > 10000000) {
                await responseCtx.reply(
                    "❌ مبلغ وارد شده خارج از محدوده مجاز (۲۵ هزار تا ۱۰ میلیون تومان) است. لطفاً دوباره تلاش کنید.",
                );
                continue; // حلقه را ادامه می‌دهیم
            }

            // اگر همه چیز درست بود
            amount = amountInput;
            inputIsValid = true; // این باعث خروج از حلقه می‌شود
            // پیام اولیه را پاک می‌کنیم تا صفحه چت تمیز بماند
            await ctx.api.deleteMessage(ctx.chat!.id, promptMessage.message_id);
        } else {
            // حالت ۳: کاربر ورودی دیگری فرستاده (عکس، استیکر و ...)
            await responseCtx.reply(
                "❌ ورودی نامعتبر است. لطفاً مبلغ را به صورت عدد وارد کنید یا روی دکمه انصراف کلیک کنید.",
            );
            // حلقه ادامه پیدا می‌کند و منتظر ورودی صحیح می‌ماند
        }
    }

    // --- ۲. نمایش اطلاعات پرداخت و درخواست رسید ---
    const cardKeyboard = new InlineKeyboard().text(
        "❌ انصراف",
        "cancel_charge",
    );

    const mainMessage = await ctx.reply(
        getCardInfoMsg({
            amount,
            type: "CHARGE",
        }),
        {
            parse_mode: "Markdown",
            reply_markup: cardKeyboard,
        },
    );

    // --- ۳. انتظار برای دریافت رسید یا انصراف ---
    while (true) {
        const response = await conversation.wait(); // منتظر هر نوع آپدیتی می‌مانیم

        // اگر کاربر انصراف داد
        if (response.callbackQuery?.data === "cancel_charge") {
            await ctx.api.deleteMessage(ctx.chat!.id, mainMessage.message_id);
            await ctx.reply("❌ عملیات افزایش موجودی لغو شد.");
            return; // خروج از conversation
        }

        if (response.message?.photo) {
            const user = await conversation.external(() =>
                db.user.findUnique({
                    where: { telegramId: BigInt(ctx.from!.id) },
                    select: { id: true, firstName: true },
                }),
            );
            if (!user) {
                await ctx.reply("خطا: کاربر یافت نشد.");
                return;
            }

            const photo = response.message.photo.pop()!; // بهترین کیفیت

            // ساخت رکورد Payment در دیتابیس
            const payment = await conversation.external(() =>
                db.payment.create({
                    data: {
                        userId: user.id,
                        amount: amount,
                        receiptImageId: photo.file_id,
                        status: "PENDING",
                        // این متادیتا مشخص می‌کند که این پرداخت فقط برای شارژ کیف پول است
                        metadata: JSON.stringify({ action: "WALLET_DEPOSIT" }),
                    },
                }),
            );

            // اطلاع به کاربر
            await ctx.reply(
                "✅ رسید شما دریافت شد. پس از تأیید توسط ادمین، کیف پول شما شارژ خواهد شد.",
            );

            // اطلاع به ادمین
            const adminMsg = `
🔔 **درخواست شارژ کیف پول**

👤 کاربر: ${user.id}
💰 مبلغ: ${amount.toLocaleString("fa-IR")} تومان

📸 رسید در ادامه ارسال می‌شود.
    `;
            const adminKeyboard = new InlineKeyboard()
                .text("✅ تأیید", `admin_approve_deposit:${payment.id}`)
                .text("❌ رد کردن", `admin_reject_deposit:${payment.id}`);

            await ctx.api.sendMessage(String(ADMIN_ID), adminMsg);
            await ctx.api.sendPhoto(String(ADMIN_ID), photo.file_id, {
                caption: `رسید کاربر ${user.id}`,
                reply_markup: adminKeyboard,
            });

            return; // پایان موفقیت‌آمیز conversation
        } else if (response.message) {
            // اگر کاربر چیز دیگری غیر از عکس فرستاد
            await ctx.reply(
                "❌ ورودی نامعتبر است.\nلطفاً **فقط عکس رسید پرداخت** را ارسال کنید یا عملیات را لغو کنید.",
            );
            // حلقه ادامه پیدا می‌کند و منتظر ورودی صحیح می‌ماند
        }
    }
};
