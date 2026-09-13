// Storage keys for local storage
export const STORAGE_KEYS = {
    USER_PAUSED: "player_user_paused",
    VOLUME: "player_volume",
    SHUFFLE: "player_shuffle",
    REPEAT: "player_repeat",
    LAST_SONG_ID: "player_last_song_id",
    LAST_SONG_PROGRESS: "player_last_song_progress",
};

/**
 * Format seconds to MM:SS string
 */
export function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Get absolute asset path
 */
export function getAssetPath(path: string): string {
    // 音乐播放器只允许站点本地资源，防止配置误触发云端请求。
    if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("//")) return "";
    if (path.startsWith("/")) return path;
    return `/${path}`;
}

/**
 * Parse LRC string into time-text objects
 */
export function parseLRC(lrc: string): { time: number; text: string }[] {
    if (!lrc) return [];
    const lines = lrc.split('\n');
    const result: { time: number; text: string }[] = [];
    const timeRegDot = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
    const timeRegColon = /\[(\d{2}):(\d{2}):(\d{2})\]/g;
    lines.forEach(line => {
        let text = line.trim();
        const dotMatches = Array.from(line.matchAll(timeRegDot));
        const colonMatches = Array.from(line.matchAll(timeRegColon));
        if (dotMatches.length > 0) {
            text = line.replace(timeRegDot, '').trim();
            dotMatches.forEach(match => {
                const m = parseInt(match[1]);
                const s = parseInt(match[2]);
                const ms = parseInt(match[3]);
                const time = m * 60 + s + ms / (match[3].length === 3 ? 1000 : 100);
                result.push({ time, text });
            });
        }
        if (colonMatches.length > 0) {
            text = line.replace(timeRegColon, '').trim();
            colonMatches.forEach(match => {
                const m = parseInt(match[1]);
                const s = parseInt(match[2]);
                const ms = parseInt(match[3]);
                const time = m * 60 + s + ms / 100;
                result.push({ time, text });
            });
        }
    });
    return result.sort((a, b) => a.time - b.time);
}

/**
 * Fetch lyrics from a URL or return raw text
 */
export async function fetchLyrics(lrcSource: string): Promise<string> {
    if (!lrcSource) return "";
    if (/^(?:https?:)?\/\//i.test(lrcSource)) return "";
    
    const assetPath = getAssetPath(lrcSource);
    
    if (assetPath.startsWith('/')) {
         try {
             const res = await fetch(assetPath);
             if (res.ok) {
                 return await res.text();
             }
         } catch (e) {
             console.error("Failed to fetch lyrics", e);
         }
    } else {
        return lrcSource;
    }
    return "";
}

/**
 * Fade in audio volume
 * Returns the interval ID so it can be cleared
 */
export function fadeInAudio(
    audio: HTMLAudioElement,
    targetVolume: number,
    duration: number = 2000,
    onComplete?: () => void
): number | null {
    if (!audio) return null;
    
    const startVolume = 0;
    const startTime = Date.now();
    audio.volume = startVolume;
    
    const interval = window.setInterval(() => {
        // Check if audio element still exists and is valid
        if (!audio || audio.muted) {
            clearInterval(interval);
            return;
        }
        
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const currentVolume = startVolume + (targetVolume - startVolume) * progress;
        
        // Ensure volume doesn't exceed 1 or go below 0
        audio.volume = Math.max(0, Math.min(1, currentVolume));
        
        if (progress >= 1) {
            clearInterval(interval);
            if (onComplete) onComplete();
        }
    }, 50);
    
    return interval;
}
