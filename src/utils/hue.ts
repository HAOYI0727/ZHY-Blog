import { siteConfig } from "@/config";
import { getPreference, setPreference } from "@utils/storage";


// Function to set hue
export function setHue(hue: number): void {
    if (!Number.isFinite(hue)) return;
    setPreference("hue", String(hue));
    if (typeof document !== "undefined") {
        const r = document.querySelector(":root") as HTMLElement;
        if (!r) {
            return;
        }
        r.style.setProperty("--hue", String(hue));
    }
}

// Function to get default hue from config-carrier dataset
export function getDefaultHue(): number {
    const fallback = siteConfig.themeColor.hue.toString();
    if (typeof document !== "undefined") {
        const configCarrier = document.getElementById("config-carrier");
        return Number.parseInt(configCarrier?.dataset.hue || fallback);
    }
    return Number.parseInt(fallback);
}

// Function to get hue from local storage or default
export function getHue(): number {
    const stored = getPreference("hue");
    const hue = stored?.trim() ? Number(stored) : NaN;
    return Number.isFinite(hue) && hue >= 0 && hue <= 360 ? hue : getDefaultHue();
}

// Function to initialize hue from local storage or default
export function initHue(): void {
    const hue = getHue();
    setHue(hue);
}
