type Rating = { source: string; value: number; certified?: boolean };
const sources: Record<string, { name: string; color: string; format: (value: number) => string }> = {
  tmdb: { name: 'TMDB', color: '#01b4e4', format: value => String(Math.round(value)) },
  trakt: { name: 'Trakt', color: '#ed1c24', format: value => String(Math.round(value)) },
  letterboxd: { name: 'Letterboxd', color: '#00e054', format: value => value.toFixed(1) },
  mal: { name: 'MyAnimeList', color: '#2e51a2', format: value => value.toFixed(1) },
  tomatoes: { name: 'Rotten Tomatoes', color: '#fa320a', format: value => `${Math.round(value)}%` },
  audience: { name: 'Audience score', color: '#fa320a', format: value => `${Math.round(value)}%` },
  metacritic: { name: 'Metacritic', color: '#ffcc33', format: value => String(Math.round(value)) },
};

export function DetailsRatings({ rating, externalRatings }: { rating?: string | null; externalRatings: Rating[] }) {
  const externalImdb = externalRatings.find(item => item.source.toLowerCase() === 'imdb' && Number.isFinite(item.value) && item.value > 0);
  const imdb = externalImdb ? externalImdb.value.toFixed(1) : rating;
  return <div className="detail-ratings-row">
    {imdb && <span className="detail-external-rating detail-imdb"><img src="/images/ratings/imdb.png" alt="IMDb" /><strong>{imdb}</strong></span>}
    {Object.entries(sources).map(([source, visuals]) => {
      const item = externalRatings.find(item => item.source.toLowerCase() === source && Number.isFinite(item.value) && item.value > 0);
      if (!item) return null;
      const icon = source === 'tomatoes' && item.certified ? 'tomatoes-certified' : source;
      return <span className="detail-external-rating" key={source} style={{ color: visuals.color }} title={visuals.name}><img src={`/images/ratings/${icon}.png`} alt={visuals.name} /><strong>{visuals.format(item.value)}</strong></span>;
    })}
  </div>;
}
