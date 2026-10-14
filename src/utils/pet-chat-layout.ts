type Rect = { left: number; right: number; top: number; bottom: number };
type PanelSize = { width: number; height: number; minWidth?: number };
/** All pet text surfaces share the same margins and avoid the character's rectangle. */
export function petPanelLayout(viewWidth: number, viewHeight: number, pet: Rect, size: PanelSize) {
    const margin = 12, gap = 14;
    const right = viewWidth - margin - pet.right - gap;
    const left = pet.left - gap - margin;
    const above = pet.top - gap - margin;
    const below = viewHeight - margin - pet.bottom - gap;
    const side = Math.max(left, right);
    const vertical = Math.max(above, below);
    const minWidth = size.minWidth ?? Math.min(240, size.width);
    if (side >= minWidth || (side >= Math.min(160, size.width) && vertical < Math.min(340, size.height))) {
        const width = Math.min(size.width, side), height = Math.min(size.height, viewHeight - margin * 2);
        return { width, height, left: right >= left ? pet.right + gap : pet.left - gap - width,
            top: Math.max(margin, Math.min(viewHeight - margin - height, pet.bottom - height)) };
    }
    const width = Math.min(size.width, viewWidth - margin * 2), height = Math.min(size.height, Math.max(0, vertical));
    return { width, height, left: Math.max(margin, Math.min(viewWidth - margin - width, pet.left)),
        top: above >= below ? pet.top - gap - height : pet.bottom + gap };
}

export function petChatLayout(viewWidth: number, viewHeight: number, pet: Rect) {
    return petPanelLayout(viewWidth, viewHeight, pet, { width: 370, height: 560 });
}

/** Fixed siblings avoid inheriting the character's floating/drag transforms. */
export function positionPetPanel(element: HTMLElement, size: { width: number; height?: number; minWidth?: number }) {
    if (element.hidden) return;
    const pet = document.querySelector<HTMLElement>("[data-lulu-pet]");
    if (!pet) return;
    const viewport = window.visualViewport;
    const offsetY = viewport?.offsetTop ?? 0, offsetX = viewport?.offsetLeft ?? 0;
    const height = viewport?.height ?? window.innerHeight, width = viewport?.width ?? window.innerWidth;
    const rect = pet.getBoundingClientRect();
    const anchor = {
        left: rect.left - offsetX, right: rect.right - offsetX,
        top: Math.min(height - 12, Math.max(12, rect.top - offsetY)),
        bottom: Math.min(height - 12, Math.max(12, rect.bottom - offsetY)),
    };
    element.style.width = `${Math.min(size.width, width - 24)}px`;
    element.style.maxHeight = "none";
    const contentHeight = () => size.height ?? element.scrollHeight + 2;
    let layout = petPanelLayout(width, height, anchor, { ...size, height: contentHeight() });
    element.style.width = `${layout.width}px`;
    // Re-measure wrapping at the chosen width before placing an auto-height surface.
    layout = petPanelLayout(width, height, anchor, { ...size, height: contentHeight() });
    element.style.left = `${layout.left + offsetX}px`; element.style.top = `${layout.top + offsetY}px`;
    element.style.bottom = "auto"; element.style.width = `${layout.width}px`;
    element.style.maxHeight = `${layout.height}px`;
    if (size.height !== undefined) element.style.height = `${layout.height}px`;
    return layout;
}
