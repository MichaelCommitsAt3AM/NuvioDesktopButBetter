import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { BackButton } from '../../components/BackButton';
import { Poster } from '../../components/Poster';
import { PosterLoadingCard } from '../../components/PosterLoadingCard';
import { HorizontalRail } from '../../components/HorizontalRail';
import { InlineError } from '../../components/Status';
import { EmptyState } from '../../components/EmptyState';
import { call, useSelector } from '../../bridge';
import type { Media } from '../../generated/contract';
import type { SourceRect } from '../../components/sourceLift';
import { animatePersonAvatar, returnPersonAvatar } from './personAvatarMotion';
import { readListPosition, saveListPosition, scrollKey, useActiveProfileId } from '../../navigation/scrollStore';
import { UserRound } from 'lucide-react';
import './details.css';
import './person.css';

type PersonDetail = {
  tmdbId: number; name: string; biography: string | null; birthday: string | null;
  deathday: string | null; placeOfBirth: string | null; profilePhoto: string | null;
  knownFor: string | null; movieCredits: Media[]; tvCredits: Media[];
  popularCredits: Media[]; latestCredits: Media[]; upcomingCredits: Media[]; creditSummary: string;
};

type RouteState = { name?: string; photo?: string; role?: string; sourceRect?: SourceRect | null; sourceKey?: string; sourceRailScrollLeft?: number; origin?: string } | null;

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
  const photoRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const creditsRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const returning = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const biographyRef = useRef<HTMLDivElement>(null);
  const [biographyOverflows, setBiographyOverflows] = useState(false);
  const animatedPhoto = useRef<string | null>(null);
  const photo = state?.photo || person?.profilePhoto;
  const name = person?.name || state?.name || '';
  useLayoutEffect(() => {
    const node = biographyRef.current;
    if (!node) return;
    const measure = () => {
      const paragraph = node.querySelector('p');
      if (paragraph) {
        setBiographyOverflows(paragraph.scrollHeight > (window.matchMedia?.('(max-width:899px)').matches ? 160 : 264) + 1);
        node.style.setProperty('--biography-height', `${paragraph.scrollHeight}px`);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [person?.biography]);

  // Wide Kotlin layout has two independent scroll panes. The narrow layout
  // uses the outer page and collapses its portrait over the first 220px.
  useLayoutEffect(() => {
    return () => {
      [pageRef.current, sidebarRef.current, creditsRef.current].forEach((pane, index) => {
        if (pane) saveListPosition(scrollKey(profileId, `/person/${tmdbId}`, ['page', 'identity', 'credits'][index]), pane.scrollTop);
      });
    };
  }, [tmdbId, profileId]);
  useLayoutEffect(() => {
    if (loading) return;
    const panes = [pageRef.current, sidebarRef.current, creditsRef.current];
    const keys = ['page', 'identity', 'credits'].map((pane) => scrollKey(profileId, `/person/${tmdbId}`, pane));
    panes.forEach((pane, index) => { if (pane) pane.scrollTop = navigationType === 'POP' ? readListPosition(keys[index]) ?? 0 : 0; });
    pageRef.current?.style.setProperty('--person-collapse', String(Math.min(1, (pageRef.current?.scrollTop ?? 0) / 220)));
  }, [tmdbId, profileId, navigationType, loading]);

  useEffect(() => {
    let active = true;
    setPerson(null);
    setError('');
    setLoading(true);
    setExpanded(false);
    setPhotoFailed(false);
    returning.current = false;
    void call<PersonDetail>('details.person', {
      personId: Number(tmdbId),
      name: state?.name,
      preferCrew: /director|writer|producer/i.test(state?.role ?? ''),
    }).then((result) => { if (!result) throw new Error('Person details are unavailable'); if (active) setPerson(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    // A slow lookup must not overwrite a later selection or profile.
    return () => { active = false; };
  }, [tmdbId, sessionProfile, retry]);

  // Cast-avatar shared motion; missing source (keyboard, direct launch)
  // falls back to the plain entrance.
  useLayoutEffect(() => {
    const node = photoRef.current;
    if (!node || !photo || animatedPhoto.current === tmdbId || !state?.sourceRect || navigationType === 'POP') return;
    animatedPhoto.current = tmdbId;
    const animation = animatePersonAvatar(node, state.sourceRect);
    return () => animation?.cancel();
  }, [photo, tmdbId, state?.sourceRect, navigationType]);

  const back = () => {
    if (returning.current) return;
    returning.current = true;
    const finish = () => { if (window.history.length > 1) navigate(-1); else navigate(state?.origin ?? '/'); };
    returnPersonAvatar(photoRef.current, state?.sourceKey, finish, state?.sourceRailScrollLeft);
  };
  const openMedia = (item: Media) => navigate(`/details/${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}`);

  return <div ref={pageRef} className="person-page" onScroll={(event) => {
    const progress = Math.min(1, event.currentTarget.scrollTop / 220);
    event.currentTarget.style.setProperty('--person-collapse', String(progress));
  }}>
    <div className="person-controls"><BackButton className="person-back" onClick={back} /></div>
    {error && !person ? <div className="person-error"><h1>Something went wrong</h1><InlineError message={error} onRetry={() => setRetry((value) => value + 1)} /></div> : <div className="person-columns" aria-busy={loading}>
      <aside ref={sidebarRef} className="person-identity" aria-label="Personal information">
        <div className="person-avatar-halo"><div ref={photoRef} className="person-avatar" style={{ transformOrigin: 'top left' }}>
          {photo && !photoFailed ? <img src={photo} alt={name} onError={() => setPhotoFailed(true)} /> : <span aria-hidden="true">{initials(name)}</span>}
        </div></div>
        {name && <h1>{name}</h1>}
        {loading ? <div className="person-facts person-skeleton" role="status" aria-label="Loading person details"><span /><span /><span /><span /><span /></div> : person && <>
          <div className="person-facts">
            {person.birthday && <PersonFact label="Born" value={birthLine(person.birthday, person.deathday)} />}
            {person.placeOfBirth && <PersonFact label="Place of birth" value={person.placeOfBirth} />}
            {person.creditSummary && <PersonFact label="Credits" value={person.creditSummary} />}
          </div>
          {person.biography && <section className="person-biography"><h2>Biography</h2><div ref={biographyRef} className={`person-biography-copy ${expanded ? 'expanded' : ''}`}><p id="person-biography-text">{person.biography}</p></div>
            {biographyOverflows && <button type="button" aria-expanded={expanded} aria-controls="person-biography-text" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Show Less ▴' : 'Show More ▾'}</button>}
          </section>}
        </>}
      </aside>
      <div ref={creditsRef} className="person-credits" aria-label="Filmography">
        {loading ? <div className="person-loading-rails" aria-hidden="true">{[0, 1, 2].map((row) => <section className="person-rail" key={row}><span className="person-heading-skeleton" /><div className="shelf-track">{[0, 1, 2, 3, 4].map((card) => <PosterLoadingCard key={card} />)}</div></section>)}</div> : person && <div className="person-credits-arrive">
          <PersonRail title="Popular" items={person.popularCredits ?? []} onOpen={openMedia} />
          <PersonRail title="Latest" items={person.latestCredits ?? []} onOpen={openMedia} />
          <PersonRail title="Upcoming" items={person.upcomingCredits ?? []} onOpen={openMedia} />
          {!person.movieCredits.length && !person.tvCredits.length && <EmptyState title="No credits found" message="No movie or TV credits were returned for this person." icon={<UserRound size={22} />} />}
        </div>}
      </div>
    </div>}
  </div>;
}

function PersonRail({ title, items, onOpen }: { title: string; items: Media[]; onOpen: (item: Media) => void }) {
  if (!items.length) return null;
  return <section className="person-rail"><h2>{title}</h2><HorizontalRail label={title}>{items.map((item) => <Poster key={`${item.type}:${item.id}`} item={item} onClick={() => onOpen(item)} />)}</HorizontalRail></section>;
}

function PersonFact({ label, value }: { label: string; value: string }) {
  return <div className="person-fact"><h2>{label}</h2><p>{value}</p></div>;
}
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'; }
function birthLine(birthday: string, deathday: string | null) {
  const birth = new Date(`${birthday}T00:00:00`);
  if (!Number.isFinite(birth.getTime())) return birthday;
  const end = deathday ? new Date(`${deathday}T00:00:00`) : new Date();
  let age = end.getFullYear() - birth.getFullYear();
  if (end.getMonth() < birth.getMonth() || (end.getMonth() === birth.getMonth() && end.getDate() < birth.getDate())) age--;
  const format = (date: Date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return [format(birth), deathday && `died ${Number.isFinite(end.getTime()) ? format(end) : deathday}`, Number.isFinite(age) && age >= 0 && `${age} years`].filter(Boolean).join(' · ');
}
