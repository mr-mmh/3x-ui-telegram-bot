import * as QRCode from "qrcode";

export async function generateQRCodeBuffer(text: string): Promise<Buffer> {
    try {
        // تولید تصویر با تنظیمات پیش‌فرض (پس‌زمینه سفید، خطوط مشکی)
        // حاشیه (margin) را کمی تنظیم می‌کنیم تا اسکن آن راحت‌تر باشد
        const buffer = await QRCode.toBuffer(text, {
            margin: 2,
            width: 300, // عرض تصویر به پیکسل
            color: {
                dark: "#000000", // رنگ نقاط
                light: "#ffffff", // رنگ پس‌زمینه
            },
        });
        return buffer;
    } catch (error) {
        console.error("خطا در تولید QR Code:", error);
        throw new Error("تولید QR Code با مشکل مواجه شد.");
    }
}
