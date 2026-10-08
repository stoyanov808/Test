# Studentski Grad painted realism assets

These original PNG illustrations were generated for this project with OpenAI's image generation tool on 8 October 2026. They are raster artwork, not hand-authored SVGs or photographs. No publisher sprites, commercial game backgrounds, downloaded photographs, or stock images were supplied to the tool. The intended direction is gritty painted realism: mature adult anatomy, worn concrete and kitchen materials, textured cloth, ceramic, food, glass and believable Sofia student nightlife lighting.

`symbol-atlas.png` is a 1254 × 1254 RGBA image in an exact 3 × 3 grid. Every tile is 418 × 418 pixels. Row-major order is book, coffee, noodles / doner, beer, female student / male student, DJ, bouncer. The female and male students are depicted as adults; DJ and bouncer are adults. All nine sprites are isolated on transparency. Two tool-based spacing refinements increased the gutters and removed the initial overlap between the middle and bottom rows. Visual inspection and alpha inspection confirmed that no substantial sprite pixels touch tile boundaries, all four corners of every tile are transparent, and every named sprite stays inside its own tile. Antialiased edge pixels are intentionally retained.

`scene-atlas.png` is a 1254 × 1254 RGB image in an exact 2 × 2 grid. Every scene is 627 × 627 pixels. Top-left is Studentski Grad dorm-block nightlife; top-right is a dormitory-kitchen preparty; bottom-left is a Friday student club; bottom-right is a snowy December outdoor student concert. Each scene has a quieter, dim central space for the board and more identity at its edges. The artwork contains no title, interface, watermark, or written block number; Block 59 is supplied by the game interface.

`manifest.json` records the exact pixel crop rectangle for every symbol and scene. Tile rectangles are atlas coordinates; scene quadrants must be clipped independently so responsive scaling cannot reveal the adjacent scene.

The source generations are retained outside the repository in `/workspace/generated_images`. Final symbols are `exec-34adfab4-2153-4999-bf36-7c6050e12a48.png`; scenes are `exec-704e1e82-63db-4a0c-a358-3117fa1ab6b2.png`. The first symbol generations and refinements are not runtime assets. New tool output was copied without pixel editing, cropping, recoloring, or opaque background substitution.

These are presentation assets only. They carry no reel mathematics, payout rules, RNG, multiplier targets, or saved-balance data.
