export function Credits() {
  return <footer className="app-footer"><span>Free, local & open source</span>
    <a href={`${import.meta.env.BASE_URL}learn/how-to-play-four-player-chess/`}>How to play</a>
    <a href={`${import.meta.env.BASE_URL}about/`}>About</a>
    <a href={`${import.meta.env.BASE_URL}privacy/`}>Privacy</a>
    <a href="https://github.com/ariesyous/li4chess/issues">Feedback / report a bug</a>
    <a href="https://github.com/ariesyous/li4chess">Source</a>
    <a href="https://github.com/ariesyous/li4chess/blob/main/LICENSE">License</a>
    <a href="https://github.com/ariesyous/li4chess/blob/main/THIRD_PARTY_NOTICES.md">Pieces & credits</a></footer>;
}
