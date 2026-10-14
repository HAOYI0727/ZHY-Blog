/** Decode SSE data frames across arbitrary network chunks and UTF-8 boundaries. */
export async function* sseData(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let data: string[] = [];
    const lineData = (line: string) => {
        if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    };
    try {
        while (true) {
            const { value, done } = await reader.read();
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            let end: number;
            while ((end = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, end).replace(/\r$/, "");
                buffer = buffer.slice(end + 1);
                if (line) lineData(line);
                else if (data.length) { yield data.join("\n"); data = []; }
            }
            if (buffer.length + data.join("\n").length > 131_072) throw new Error("Invalid SSE frame");
            if (done) {
                lineData(buffer.replace(/\r$/, ""));
                if (data.length) yield data.join("\n");
                return;
            }
        }
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}
