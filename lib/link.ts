export function generateDynamicLink(
    clientPayload: any,
    inboundObj: any,
): string {
    const serverAddress = process.env.INBOUND_SERVER_ADDRESS;
    const protocol = inboundObj.protocol || "vless"; // vless, vmess, etc.
    const port = inboundObj.port;
    const uuid = clientPayload.id;
    const remark = encodeURIComponent(clientPayload.email);

    const streamSettings = JSON.parse(inboundObj.streamSettings);
    const params = new URLSearchParams();

    // 1. تنظیم نوع شبکه (tcp, ws, grpc)
    const network = streamSettings.network || "tcp";
    params.set("type", network);

    // 2. تنظیمات امنیت (none, tls, reality)
    const security = streamSettings.security || "none";
    params.set("security", security);

    if (protocol === "vless") {
        params.set("encryption", "none");
    }

    // 3. استخراج تنظیمات اختصاصی TCP (مخصوص کانفیگ شما)
    if (network === "tcp" && streamSettings.tcpSettings) {
        const tcpSettings = streamSettings.tcpSettings;

        // اگر هدر HTTP فعال باشد
        if (tcpSettings.header && tcpSettings.header.type === "http") {
            params.set("headerType", "http");

            const request = tcpSettings.header.request;
            if (request) {
                if (request.path && request.path.length > 0) {
                    params.set("path", request.path.join(","));
                }
                if (
                    request.headers &&
                    request.headers.Host &&
                    request.headers.Host.length > 0
                ) {
                    params.set("host", request.headers.Host.join(","));
                }
            }
        }
    }

    if (network === "ws" && streamSettings.wsSettings) {
        if (streamSettings.wsSettings.path) {
            params.set("path", streamSettings.wsSettings.path);
        }
        if (streamSettings.wsSettings.headers?.Host) {
            params.set("host", streamSettings.wsSettings.headers.Host);
        }
    }

    if (security === "reality" && streamSettings.realitySettings) {
        const rs = streamSettings.realitySettings;
        if (rs.serverNames?.length > 0) params.set("sni", rs.serverNames[0]);
        if (rs.settings?.publicKey) params.set("pbk", rs.settings.publicKey);
        if (rs.shortIds?.length > 0) params.set("sid", rs.shortIds[0]);
        if (rs.fingerprint) params.set("fp", rs.fingerprint);
        if (clientPayload.flow) params.set("flow", clientPayload.flow);
    }

    // سرهم کردن لینک نهایی
    // از decodeURIComponent استفاده می‌کنیم تا کاراکترهایی مثل = یا & خراب نشوند
    const queryString = decodeURIComponent(params.toString());

    return `${protocol}://${uuid}@${serverAddress}:${port}?${queryString}#${remark}`;
}
