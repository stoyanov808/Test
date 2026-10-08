# Original art for ОТ СТАРОТО · revision 2

The supplied references guide the bold black ink, expressive rubber-hose faces, worn Bulgarian street setting and restrained scarlet/amber palette. These are new illustrations. The reference images, their lettering and commercial slot assets are not shipped.

`symbols-premium.png` is an original, transparent 1225×1284 raster illustration atlas containing nine distinct paying objects: bottle, cash, chain, cassette, sneaker, crown, lighter, dice and signet ring. It uses detailed etched material shading, cream paper, textured black leather, glass and antique gold accents. The first six replace the previous simple SVG objects.

`character-left-actions.png`, `character-middle-actions.png` and `character-right-actions.png` are original transparent 1536×1024 raster animation sheets. Each has four separately illustrated full-body poses: idle, reveal/anticipation, action and recoil/follow-through. They preserve the fictional sunglasses/Wild thrower, fringe-haired shooter and lean gold-toothed coin dealer. Actions are articulated drawings, not rotated copies of the idle artwork.

`getaway-car.png` is an original transparent 1536×1024 detailed illustration of a battered fictional Lada-style sedan with three adult characters and muzzle flashes. `ruse-yard.png` is the original 1672×941 fictional Ruse courtyard from revision 1; its architecture and evening lighting remain the scene background.

These raster assets were produced with image generation on 8 October 2026. They are generated illustrations, not photographs or a claim of traditional hand-drawn production. The Wild star, Bonus ticket, MAX target and four engraved coin plates are separately authored SVG drawings. The MAX plate is a grid symbol with a clear 19,999× badge; coin SVGs reserve space for the live receipt values drawn by the renderer.

`src/art.ts` retains the PNGs intact and supplies precise display windows. The Canvas renderer loads each unique atlas once and draws the selected source rectangle. Character metadata includes a consistent body scale and foot anchor so a wider action gesture does not shrink or move the actor. Cached clipped SVG layouts provide equivalent images for the DOM win scenes. Detached throw tokens are excluded from the character windows because the renderer animates the actual receipt target separately.

The previous drawings are archived in `docs/archive-art-v1/` for provenance and comparison. No web photographs, commercial slot sprites or recordings are included. Default audio is synthesized locally; uploaded custom audio stays on the user's device.
