import { randomUUID } from "crypto";

interface ApiConfig {
    baseUrl: string;
    username: string;
    password: string;
}

interface ApiResponse<T = any> {
    success: boolean;
    msg: string;
    obj: T;
}

export class APIClient {
    private baseUrl: string;
    private username: string;
    private password: string;
    private inbound_id: number;
    private cookie: string | null = null;

    constructor() {
        if (
            !process.env.API_BASE_URL ||
            !process.env.API_USERNAME ||
            !process.env.API_PASSWORD ||
            !process.env.API_INBOUND_ID
        ) {
            throw new Error(
                "base url or username or pasword or inbound id for api not set in env.",
            );
        }
        this.baseUrl = process.env.API_BASE_URL;
        this.username = process.env.API_USERNAME;
        this.password = process.env.API_PASSWORD;
        this.inbound_id = Number(process.env.API_INBOUND_ID);
    }

    async login(): Promise<boolean> {
        try {
            const formData = new FormData();
            formData.append("username", this.username);
            formData.append("password", this.password);

            const response = await fetch(`${this.baseUrl}/login`, {
                method: "POST",
                body: formData,
            });

            const data = (await response.json()) as ApiResponse;
            if (data.success) {
                // استخراج کوکی از هدر
                const setCookie = response.headers.get("set-cookie");
                if (setCookie) {
                    // معمولاً کوکی شامل چندین بخش است، ما بخش اصلی session را برمیداریم
                    this.cookie = setCookie.split(";")[0]!;
                    return true;
                }
            }
            console.error("❌ Login failed:", data.msg);
            return false;
        } catch (error) {
            console.error("❌ Login error:", error);
            return false;
        }
    }

    private async request<T = any>(
        endpoint: string,
        method: string = "GET",
        body?: FormData,
    ): Promise<ApiResponse<T>> {
        if (!this.cookie) {
            const loggedIn = await this.login();
            if (!loggedIn) throw new Error("Authentication failed");
        }

        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}/${endpoint}`, {
                method,
                headers: {
                    Cookie: this.cookie!,
                    Accept: "application/json",
                },
                body,
            });
        } catch (error) {
            console.error("Error in request", error);
            throw new Error(`Something went wrong in request to ${endpoint}`);
        }

        if (response.status !== 200) {
            this.cookie = null;
            throw new Error(`Request failed with status ${response.status}`);
        }

        return (await response.json()) as ApiResponse<T>;
    }

    async addClient(email: string, totalGB: number, expireDays: number) {
        const totalBytes = totalGB * 1024 * 1024 * 1024;
        let finalExpiryTime: number;

        if (expireDays === 0) {
            finalExpiryTime = 0;
        } else {
            const dayInMs = 24 * 60 * 60 * 1000;
            // - for start after first use
            finalExpiryTime = expireDays * dayInMs * -1;
        }

        const clientPayload = {
            enable: true,
            id: crypto.randomUUID(),
            subId: crypto.randomUUID(),
            totalGB: totalBytes,
            email,
            expiryTime: finalExpiryTime,
            flow: "",
        };

        const body = new FormData();
        body.append("id", this.inbound_id.toString());
        body.append(
            "settings",
            JSON.stringify({
                clients: [clientPayload],
            }),
        );

        const response = await this.request(
            "/panel/api/inbounds/addClient",
            "POST",
            body,
        );

        if (response.success) {
            return clientPayload;
        } else {
            throw new Error(
                `Error in add client: ${response.msg || "unknown"}`,
            );
        }
    }

    async getInbound() {
        const url = `/panel/api/inbounds/get/${this.inbound_id}`;

        const response = await this.request(url, "GET");

        if (response.success && response.obj) {
            return response.obj;
        } else {
            throw new Error(
                `Error in get inbound: ${response.msg || "unknown"}`,
            );
        }
    }

    async getTraficsByEmail(email: string) {
        const url = `/panel/api/inbounds/getClientTraffics/${email}`;

        const response = await this.request<{
            id: number;
            inboundId: number;
            enable: boolean;
            email: string;
            uuid: string;
            subId: string;
            up: number;
            down: number;
            allTime: number;
            expiryTime: number;
            total: number;
            reset: number;
            lastOnline: number;
        }>(url, "GET");

        if (response.success && response.obj) {
            return response.obj;
        } else {
            return null;
        }
    }
}
