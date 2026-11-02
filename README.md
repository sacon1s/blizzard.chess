# Blizzard Chess

Free chess site: play Blizzard bots of every strength, review your games with the engine, analyse positions. Play online with accounts and ratings. Puzzles are coming next.

Live: https://sacon1s.github.io/blizzard.chess/

> **Closed for a rebuild.** The live site shows a "closed" page from `maintenance/` (`npm run close`). To open the site again, run `npm run build`: it rebuilds the app into `docs/`.

The engine is [Blizzard](https://github.com/sacon1s/blizzard) 0.9, running in the browser.

## Develop

```
npm install
npm run dev      # local server
npm run build    # builds the site into docs/ (GitHub Pages serves main /docs)
```

Fonts: Archivo and Golos Text (SIL Open Font License, see `LICENSES/`). Pieces: Maestro and other sets from the lichess.org collection, each under its author's license (see `LICENSES/pieces.md`). Move sounds: recorded on a real magnetic chess board by sacon1s.
