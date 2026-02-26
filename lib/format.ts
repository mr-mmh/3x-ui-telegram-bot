export function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function convertTimestampToFarsiDate(ts: number | null): string {
    if (!ts || ts < 0) {
        return "شروع نشده";
    }

    const date = new Date(ts);

    return date.toLocaleDateString("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

interface TimeRemaining {
    days: number;
    hours: number;
    isExpired: boolean;
}

export function calculateTimeRemaining(ts: number | null): TimeRemaining {
    if (!ts || ts < 0) {
        return { days: 0, hours: 0, isExpired: false };
    }

    const now = Date.now();
    const diff = ts - now;

    if (diff <= 0) {
        return { days: 0, hours: 0, isExpired: true };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    return {
        days,
        hours,
        isExpired: false,
    };
}
