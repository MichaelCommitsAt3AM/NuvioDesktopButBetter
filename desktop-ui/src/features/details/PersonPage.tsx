import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { BackButton } from '../../components/BackButton';
import { Poster } from '../../components/Poster';
import { InlineError } from '../../components/Status';
import { EmptyState } from '../../components/EmptyState';
import { call, useSelector } from '../../bridge';
import type { Media } from '../../generated/contract';
import { animateLift, type SourceRect } from '../../components/sourceLift';
import { scrollKey, useActiveProfileId, useListScrollRestore } from '../../navigation/scrollStore';
import { LoaderCircle, UserRound } from 'lucide-react';
import './details.css';

type PersonDetail = {
  tmdbId: number; name: string; biography: string | null; birthday: string | null;
  deathday: string | null; placeOfBirth: string | null; profilePhoto: string | null;
  knownFor: string | null; movieCredits: Media[]; tvCredits: Media[];
};

type RouteState = { name?: string; role?: string; sourceRect?: SourceRect | null; origin?: string } | null;

/**
 * Dedicated person route backed by `details.person`. Carries the originating
 * route in history so Back restores its scroll and tab state; the cast
 * avatar animates into the photo with a no-source fade fallback.
 */
export function PersonPage() {
  const { tmdbId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const profileId = useActiveProfileId();
  const sessionProfile = useSelector((current) => current?.session?.activeProfile ?? null);
  const state = (location.state ?? null) as RouteState;
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const photoRef = useRef<HTMLImageElement>(null);
  useListScrollRestore(scrollKey(profileId, `/person/${tmdbId}`, ''), navigationType, !!person);

  useEffect(() => {
    let active = true;
    setPerson(null);
    setError('');
    setLoading(true);
    void call<PersonDetail>('details.person', {
      personId: Number(tmdbId),
      name: state?.name,
      preferCrew: /director|writer|producer/i.test(state?.role ?? ''),
    }).then((result) => { if (active) setPerson(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    // A slow lookup must not overwrite a later selection or profile.
    return () => { active = false; };
  }, [tmdbId, sessionProfile, retry]);

  // Cast-avatar shared motion; missing source (keyboard, direct launch)
  // falls back to the plain entrance.
  useEffect(() => {
    const node = photoRef.current;
    if (node && person?.profilePhoto && state?.sourceRect) animateLift(node, state.sourceRect);
  }, [person?.profilePhoto, state?.sourceRect]);

  const back = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(state?.origin ?? '/');
  };
  const openMedia = (item: Media) => navigate(`/details/${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}`);

  return <div className="page detail-page person-page">
    <div className="detail-screen-controls">
      <BackButton className="detail-back" onClick={back} />
      {person && <span className="detail-condensed-title" aria-hidden="true">{person.name}</span>}
    </div>
    {loading && <div className="loading-block"><LoaderCircle className="spin" size={22} /><span>Loading person…</span></div>}
    {error && !person && <InlineError message={error} onRetry={() => setRetry((value) => value + 1)} />}
    {person && <>
      <div className="person-hero">
        {person.profilePhoto
          ? <img ref={photoRef} className="person-photo" src={person.profilePhoto} alt={person.name} />
          : <span className="person-photo person-photo-fallback" aria-hidden="true"><UserRound size={40} /></span>}
        <div><h1>{person.name}</h1><p className="muted">{[person.knownFor, person.birthday, person.deathday && `Died ${person.deathday}`, person.placeOfBirth].filter(Boolean).join(' · ')}</p></div>
      </div>
      {person.biography && <p className="details-extras-biography">{person.biography}</p>}
      <PersonRail title="Movies" items={person.movieCredits} onOpen={openMedia} />
      <PersonRail title="TV" items={person.tvCredits} onOpen={openMedia} />
      {!person.movieCredits.length && !person.tvCredits.length && <EmptyState title="No credits found" message="No movie or TV credits were returned for this person." icon={<UserRound size={22} />} />}
    </>}
  </div>;
}

function PersonRail({ title, items, onOpen }: { title: string; items: Media[]; onOpen: (item: Media) => void }) {
  if (!items.length) return null;
  return <section className="details-extras-rail"><h2>{title}</h2><div className="shelf-track">{items.map((item) => <Poster key={`${item.type}:${item.id}`} item={item} onClick={() => onOpen(item)} />)}</div></section>;
}
