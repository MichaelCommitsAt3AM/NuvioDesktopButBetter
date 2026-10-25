import './imdbRating.css';

export function ImdbRating({ rating }: { rating: string }) {
  return <span className="imdb-rating"><img src="/images/ratings/imdb.png" alt="IMDb" /><span>{rating}</span></span>;
}
