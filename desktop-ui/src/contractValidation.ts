import type { ValidateFunction } from 'ajv';
import * as compiledValidators from './generated/validators.js';
import type { Addons, Catalog, Discover, SearchHistory, Details, Event, Home, Library, Response, Search, Session, Settings, Streams } from './generated/contract';

function validator(definition: string) {
  const compiled = (compiledValidators as Record<string, ValidateFunction>)[definition];
  if (!compiled) throw new Error(`Missing generated contract definition: ${definition}`);
  return compiled;
}

export function assertContract<T>(definition: string, value: unknown): asserts value is T {
  const check = validator(definition);
  if (!check(value)) {
    const reason = check.errors?.map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ') ?? 'invalid payload';
    throw new Error(`Invalid bridge ${definition} payload: ${reason}`);
  }
}

export function assertResponse(value: unknown): asserts value is Response {
  assertContract<Response>('Response', value);
}

export function assertEvent(value: unknown): asserts value is Event {
  assertContract<Event>('Event', value);
  const event = value;
  switch (event.topic) {
    case 'session': assertContract<Session>('Session', event.data); break;
    case 'home': assertContract<Home>('Home', event.data); break;
    case 'library': assertContract<Library>('Library', event.data); break;
    case 'addons': assertContract<Addons>('Addons', event.data); break;
    case 'settings': assertContract<Settings>('Settings', event.data); break;
    case 'search': assertContract<Search>('Search', event.data); break;
    case 'details': assertContract<Details>('Details', event.data); break;
    case 'streams': assertContract<Streams>('Streams', event.data); break;
    case 'catalog': assertContract<Catalog>('Catalog', event.data); break;
    case 'discover': assertContract<Discover>('Discover', event.data); break;
    case 'searchHistory': assertContract<SearchHistory>('SearchHistory', event.data); break;
    case 'playback': break;
  }
}

export function assertMethodResult(method: string, value: unknown) {
  switch (method) {
    case 'session.snapshot': assertContract<Session>('Session', value); break;
    case 'home.snapshot': assertContract<Home>('Home', value); break;
    case 'library.snapshot': assertContract<Library>('Library', value); break;
    case 'addons.snapshot':
      assertContract<Addons>('Addons', value);
      break;
    case 'settings.snapshot': assertContract<Settings>('Settings', value); break;
  }
}
