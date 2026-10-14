export type PetSurface = "none" | "info" | "chat" | "notes";
let active: PetSurface = "none";

export const activePetSurface = () => active;

/** One foreground surface owns the pet's text area; ambient bubbles have no priority. */
export function activatePetSurface(surface: PetSurface) {
    if (surface === active) return;
    active = surface;
    window.dispatchEvent(new CustomEvent<PetSurface>("lulu:surface-change", { detail: surface }));
}

/** A closing window must not dismiss a different window that has just replaced it. */
export function closePetSurface(owner: PetSurface) {
    if (active === owner) activatePetSurface("none");
}
